// PM2 process manager config
// Usage:
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup   ← run the command it prints to auto-start on reboot

module.exports = {
  apps: [
    {
      name: 'tlms',
      script: 'server.js',
      instances: 1,           // SQLite only supports single-writer, keep at 1
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      // Redirect logs to files
      out_file: './logs/tlms-out.log',
      error_file: './logs/tlms-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
