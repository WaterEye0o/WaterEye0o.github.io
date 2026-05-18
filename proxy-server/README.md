# WeChat Proxy Server

This is a lightweight HTTP proxy server that sits between GitHub Actions and the WeChat Official Account API. It solves the IP whitelist problem: GitHub Actions runners use dynamic IPs from Microsoft Azure, which cannot be added to WeChat's IP whitelist. This server runs on a cloud VPS with a fixed public IP, and only that IP needs to be whitelisted.

## How It Works

1. GitHub Actions generates an article and sends it to this proxy server (including images as base64).
2. The proxy server:
   - Authenticates the request via a shared secret
   - Obtains a WeChat `access_token`
   - Uploads images to WeChat
   - Creates a draft article
3. The proxy returns the WeChat `media_id` back to GitHub Actions.

## Prerequisites

- A cloud VPS with a **fixed public IP** (e.g., Tencent Cloud Lighthouse, Alibaba Cloud ECS)
- Node.js >= 18 installed on the server
- WeChat Official Account with draft API permission
- The server's public IP added to the WeChat OA IP whitelist

## Deployment

### 1. Upload Code to Server

You can either clone the entire repository on the server, or copy only the necessary files:

```bash
# Option A: Clone the full repo
git clone https://github.com/WaterEye0o/pet-daily.git
cd pet-daily/proxy-server

# Option B: Copy only the required files
# scp proxy-server/* user@your-server:/opt/wechat-proxy/
# scp src/wechat-api.js user@your-server:/opt/wechat-proxy/src/
```

### 2. Set Environment Variables

Create a `.env` file or export variables directly:

```bash
export WECHAT_APPID=your_appid
export WECHAT_APPSECRET=your_appsecret
export WECHAT_PROXY_SECRET=a_random_long_string
export PORT=3000
```

> **Security**: `WECHAT_PROXY_SECRET` should be a long random string. GitHub Actions will send this in the `Authorization` header.

### 3. Start the Server

```bash
node server.js
```

For production, use a process manager like **PM2**:

```bash
npm install -g pm2
pm2 start server.js --name wechat-proxy
pm2 save
pm2 startup
```

### 4. Configure Firewall / Security Group

- Open the port (default `3000`) in your cloud provider's security group.
- (Optional) Restrict inbound traffic to GitHub Actions IP ranges for extra security.

### 5. Add Server IP to WeChat Whitelist

1. Log in to [WeChat Official Account Platform](https://mp.weixin.qq.com/)
2. Go to **Settings & Development** -> **Basic Configuration** -> **IP Whitelist**
3. Add your server's public IP address

## GitHub Actions Configuration

In your GitHub repository, go to **Settings** -> **Secrets and variables** -> **Actions**:

1. **Delete** the old secrets:
   - `WECHAT_APPID`
   - `WECHAT_APPSECRET`

2. **Add** new secrets:
   - `WECHAT_PROXY_URL`: `http://YOUR_SERVER_IP:3000/api/publish-wechat-draft`
   - `WECHAT_PROXY_SECRET`: The same value you set on the server

Keep `WECHAT_AUTHOR` if you were using it.

## API Endpoint

### `POST /api/publish-wechat-draft`

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <WECHAT_PROXY_SECRET>
```

**Body:**
```json
{
  "title": "Article Title",
  "content": "<p>HTML content with local image paths...</p>",
  "author": "Author Name",
  "imageFiles": [
    {
      "localPath": "/images/articles/slug/image1.jpg",
      "filename": "image1.jpg",
      "data": "base64encodedstring..."
    }
  ]
}
```

**Response (success):**
```json
{ "success": true, "mediaId": "MEDIA_ID" }
```

**Response (error):**
```json
{ "success": false, "error": "error message" }
```

## Local Testing

You can test the proxy locally before deploying:

```bash
cd proxy-server
WECHAT_APPID=xxx WECHAT_APPSECRET=yyy WECHAT_PROXY_SECRET=test node server.js
```

Then in another terminal:

```bash
cd /Users/wangpanying/WorkSpace/WaterEye0o.github.io
WECHAT_PROXY_URL=http://localhost:3000/api/publish-wechat-draft \
WECHAT_PROXY_SECRET=test \
WECHAT_APPID=xxx \
WECHAT_APPSECRET=yyy \
node -e "require('./src/publish-to-wechat').publishArticle('./articles/some-article.md')"
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `401 Unauthorized` | Check that `WECHAT_PROXY_SECRET` matches between GitHub and server |
| `invalid ip ... not in whitelist` | Add the server's public IP to the WeChat OA IP whitelist |
| `40007 - invalid media_id` | Usually means the thumb image upload failed; check image file size and format |
| Server not reachable | Check cloud security group / firewall rules for the proxy port |
