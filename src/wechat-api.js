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

function uploadFile(url, filePath, fieldName = 'media') {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      reject(new Error(`File not found: ${filePath}`));
      return;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const boundary = `----WeChatFormBoundary${Date.now()}`;
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.gif') contentType = 'image/gif';

    const pre = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
      'utf-8'
    );
    const post = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = Buffer.concat([pre, fileBuffer, post]);

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
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
    req.write(body);
    req.end();
  });
}

async function requestAccessToken(appId, appSecret) {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
  const response = await httpGetJson(url);
  const data = JSON.parse(response.text);
  if (data.errcode) {
    throw new Error(`WeChat token error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.access_token) {
    throw new Error(`Failed to get access_token: ${response.text}`);
  }
  return data.access_token;
}

async function uploadImage(accessToken, localFilePath) {
  const url = `https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`;
  const response = await uploadFile(url, localFilePath, 'media');
  const data = JSON.parse(response.text);
  if (data.errcode) {
    throw new Error(`WeChat uploadimg error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.url) {
    throw new Error(`Failed to upload image: ${response.text}`);
  }
  return data.url;
}

async function uploadThumbMedia(accessToken, localFilePath) {
  const url = `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=thumb`;
  const response = await uploadFile(url, localFilePath, 'media');
  const data = JSON.parse(response.text);
  if (data.errcode) {
    throw new Error(`WeChat add_material error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.media_id) {
    throw new Error(`Failed to upload thumb media: ${response.text}`);
  }
  return { mediaId: data.media_id, url: data.url };
}

async function addDraft(accessToken, article) {
  const url = `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`;
  const response = await httpPostJson(url, { articles: [article] });
  const data = JSON.parse(response.text);
  if (data.errcode) {
    throw new Error(`WeChat draft/add error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.media_id) {
    throw new Error(`Failed to create draft: ${response.text}`);
  }
  return data.media_id;
}

async function publishDraft(accessToken, mediaId) {
  const url = `https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${accessToken}`;
  const response = await httpPostJson(url, { media_id: mediaId });
  const data = JSON.parse(response.text);
  if (data.errcode) {
    throw new Error(`WeChat freepublish/submit error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.publish_id) {
    throw new Error(`Failed to publish draft: ${response.text}`);
  }
  return data.publish_id;
}

async function massSend(accessToken, mediaId) {
  const url = `https://api.weixin.qq.com/cgi-bin/message/mass/sendall?access_token=${accessToken}`;
  const payload = {
    filter: {
      is_to_all: "true",
    },
    mpnews: {
      media_id: mediaId,
    },
    msgtype: 'mpnews',
    send_ignore_reprint: 0,
  };
  const response = await httpPostJson(url, payload);
  const data = JSON.parse(response.text);
  if (data.errcode) {
    throw new Error(`WeChat mass/sendall error ${data.errcode}: ${data.errmsg}`);
  }
  if (!data.msg_id) {
    throw new Error(`Failed to mass send: ${response.text}`);
  }
  return { msgId: data.msg_id, msgDataId: data.msg_data_id };
}

module.exports = {
  requestAccessToken,
  uploadImage,
  uploadThumbMedia,
  addDraft,
  publishDraft,
  massSend,
};
