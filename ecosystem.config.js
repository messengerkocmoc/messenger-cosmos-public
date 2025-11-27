module.exports = {
  apps : [{
    name: "kocmoc-messenger",
    script: "/opt/kocmoc/server/server.js",
    instances: 1,
    exec_mode: "fork",
    watch: false,
    env: {
      NODE_ENV: "production",
      PORT: 3000
    }
  }]
};
