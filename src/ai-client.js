const { spawn } = require('child_process');

// 通过 qodercn CLI 的 headless 模式生成文章，替代原先的 DeepSeek HTTP API 调用。
const DEFAULT_BIN = 'qodercn';
const DEFAULT_MODEL = 'DeepSeek-V4-Pro';
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TURNS = '1';
const MAX_OUTPUT_TOKENS = '8000';

// 统一追加在用户提示词末尾的输出约束
const OUTPUT_REQUIREMENT = '\n\n【输出要求】直接输出文章 Markdown 正文本身，第一行是标题，不要任何解释性开场白、结束语，不要用代码块包裹。';

function resolveBin() {
  return process.env.QODERCN_BIN || DEFAULT_BIN;
}

function resolveModel() {
  return process.env.QODERCN_MODEL || DEFAULT_MODEL;
}

function resolveTimeoutMs() {
  const parsed = parseInt(process.env.QODERCN_TIMEOUT_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function buildArgs(userPrompt, systemPrompt) {
  const model = resolveModel();
  return [
    '-p', userPrompt,
    '--system-prompt', systemPrompt,
    '-m', model,
    '--tools', '',
    '--permission-mode', 'dont_ask',
    '--no-session-persistence',
    '--max-turns', MAX_TURNS,
    '--max-output-tokens', MAX_OUTPUT_TOKENS,
    '--output-format', 'json',
  ];
}

// stderr 可能很长（堆栈、更新日志），只保留末尾若干字符用于报错信息
function summarizeStderr(stderr, limit = 500) {
  const text = (stderr || '').trim();
  if (!text) return '';
  const clipped = text.length > limit ? `...${text.substring(text.length - limit)}` : text;
  return ` | stderr: ${clipped}`;
}

function runCli(args, timeoutMs) {
  const bin = resolveBin();

  return new Promise((resolve, reject) => {
    let child;
    try {
      // 提示词含中文与换行，必须用 args 数组直接传递，不经过 shell
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(new Error(`无法启动 qodercn CLI（${bin}）：${err.message}`));
      return;
    }

    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`qodercn CLI 超时（${Math.round(timeoutMs / 1000)}s），已终止子进程`));
    }, timeoutMs);

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === 'ENOENT') {
        reject(new Error(
          `未找到 qodercn CLI（${bin}）。请先安装：` +
          'curl -fsSL https://static.qoder.com.cn/qoder-cli-cn/install.sh | bash，' +
          '或用环境变量 QODERCN_BIN 指定可执行文件路径。'
        ));
      } else {
        reject(new Error(`调用 qodercn CLI 失败：${err.message}`));
      }
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
        stderr: Buffer.concat(stderrChunks).toString('utf-8'),
      });
    });
  });
}

// --output-format json 输出单个 JSON 对象；CLI 可能在前后打印日志，因此降级截取首个 { 到最后一个 }
function parseJsonPayload(stdout, stderrSummary) {
  const text = (stdout || '').trim();
  if (!text) {
    throw new Error(`qodercn CLI 没有任何标准输出${stderrSummary}`);
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    // 整体不是合法 JSON，继续尝试截取片段
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.substring(start, end + 1));
    } catch (err) {
      // 截取的片段仍不是合法 JSON
    }
  }

  throw new Error(
    `无法解析 qodercn CLI 的 JSON 输出${stderrSummary} | stdout 开头: ${JSON.stringify(text.substring(0, 200))}`
  );
}

function extractContent(stdout, stderrSummary) {
  const payload = parseJsonPayload(stdout, stderrSummary);

  if (payload.is_error === true) {
    throw new Error(`qodercn CLI 返回错误（is_error=true）${stderrSummary}`);
  }

  const content = typeof payload.result === 'string' ? payload.result.trim() : '';
  if (!content) {
    throw new Error(`qodercn CLI 返回的 result 字段为空${stderrSummary}`);
  }

  return content;
}

/**
 * 调用 qodercn CLI 生成文章正文
 * @param {{ systemPrompt: string, userPrompt: string }} options
 * @returns {Promise<string>} Markdown 正文
 */
async function generateArticle({ systemPrompt, userPrompt }) {
  if (!systemPrompt || !userPrompt) {
    throw new Error('generateArticle 需要同时提供 systemPrompt 与 userPrompt');
  }

  const timeoutMs = resolveTimeoutMs();
  const { code, signal, stdout, stderr } = await runCli(buildArgs(userPrompt + OUTPUT_REQUIREMENT, systemPrompt), timeoutMs);
  const stderrSummary = summarizeStderr(stderr);

  if (code !== 0) {
    throw new Error(
      `qodercn CLI 执行失败（exit code=${code}${signal ? `, signal=${signal}` : ''}）${stderrSummary}`
    );
  }

  return extractContent(stdout, stderrSummary);
}

module.exports = { generateArticle };
