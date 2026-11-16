module.exports = {
  apps: [{
    name: 'wechat-proxy',
    script: 'server.js',
    cwd: '/root/proxy-server',
    env: {
      WECHAT_PROXY_SECRET: 'aaabin',
      WECHAT_APPID: 'wx33dc56263aef283a',
      WECHAT_APPSECRET: '4af2cafbfde76bad7a509168f09113f9',
      PORT: 3010
    }
  }]
};