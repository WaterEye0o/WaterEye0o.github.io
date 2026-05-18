const https = require('https');
const fs = require('fs');
const path = require('path');

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpGetJson(res.headers.location));
        return;
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({ statusCode: res.statusCode, text });
      });
    }).on('error', reject);
  });
}

function httpPostJson(url, data) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(data);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve({ statusCode: res.statusCode, text });
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testAccessToken(appId, appSecret) {
  console.log('\n[Step 1] Testing access_token...');
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const response = await httpGetJson(url);
  const data = JSON.parse(response.text);

  if (data.errcode) {
    console.error(`  ERROR: ${data.errcode} - ${data.errmsg}`);
    return null;
  }
  console.log('  OK: Access token obtained');
  return data.access_token;
}

async function testDraftSwitch(accessToken) {
  console.log('\n[Step 2] Testing draft/switch (check status)...');
  const url = `https://api.weixin.qq.com/cgi-bin/draft/switch?access_token=${accessToken}&checkonly=1`;
  const response = await httpGetJson(url);
  const data = JSON.parse(response.text);

  if (data.errcode) {
    console.error(`  ERROR: ${data.errcode} - ${data.errmsg}`);
    return false;
  }
  console.log(`  OK: Draft switch status = ${data.is_open} (1=open, 0=closed)`);
  return data.is_open === 1;
}

async function testDraftAdd(accessToken) {
  console.log('\n[Step 3] Testing draft/add...');
  const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`;
  const response = await httpPostJson(url, {
    articles: [{
      title: 'Test Article - Please Delete',
      author: 'Test',
      digest: 'This is a test article.',
      content: '<p>This is a test article content.</p>',
      content_source_url: '',
      thumb_media_id: '',
      need_open_comment: 0,
      only_fans_can_comment: 0,
    }]
  });
  const data = JSON.parse(response.text);

  if (data.errcode) {
    console.error(`  ERROR: ${data.errcode} - ${data.errmsg}`);
    if (data.errcode === 48001) {
      console.error('  -> Your account does NOT have permission to use draft/add API.');
      console.error('  -> This API requires a WECHAT-CERTIFIED SERVICE ACCOUNT (企业认证服务号).');
    }
    if (data.errcode === 40007) {
      console.error('  -> Invalid thumb_media_id. This is expected since we used empty string.');
    }
    return false;
  }
  console.log(`  OK: Draft created with media_id = ${data.media_id}`);
  return true;
}

async function main() {
  const appId = process.env.WECHAT_APPID;
  const appSecret = process.env.WECHAT_APPSECRET;

  if (!appId || !appSecret) {
    console.error('ERROR: Please set WECHAT_APPID and WECHAT_APPSECRET environment variables.');
    console.error('Example: WECHAT_APPID=xxx WECHAT_APPSECRET=yyy node scripts/test-wechat-api.js');
    process.exit(1);
  }

  console.log('=== WeChat Official Account API Diagnostic ===');
  console.log(`AppID: ${appId.substring(0, 4)}...${appId.substring(-4)}`);

  const accessToken = await testAccessToken(appId, appSecret);
  if (!accessToken) {
    console.log('\nDIAGNOSIS: Your AppID or AppSecret is invalid.');
    process.exit(1);
  }

  const isDraftOpen = await testDraftSwitch(accessToken);
  if (!isDraftOpen) {
    console.log('\nWARNING: Draft feature may not be enabled for your account.');
    console.log('If you have a certified service account, you can enable it by calling:');
    console.log('  POST https://api.weixin.qq.com/cgi-bin/draft/switch?access_token=TOKEN');
  }

  const canAddDraft = await testDraftAdd(accessToken);

  console.log('\n=== Summary ===');
  if (canAddDraft) {
    console.log('Your account has draft/add permission. The issue is likely elsewhere:');
    console.log('  1. Check GitHub Actions logs for specific errors during image upload');
    console.log('  2. Ensure images are <= 64KB for thumb_media_id upload');
  } else {
    console.log('Your account CANNOT use draft/add API.');
    console.log('This is the expected behavior for:');
    console.log('  - Personal subscription accounts (个人订阅号)');
    console.log('  - Uncertified service accounts (未认证服务号)');
    console.log('  - Any account without "微信认证"');
    console.log('\nSolution: You need a WECHAT-CERTIFIED SERVICE ACCOUNT (企业认证服务号).');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
