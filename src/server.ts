import { createServer, type Server } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || '0.0.0.0';
const port = parseInt(process.env.PORT || '5000', 10);

// 记录启动时间，供 /api/health 计算 uptime
process.env.REUP_STARTED_AT = String(Date.now());

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

let server: Server | null = null;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n> Received ${signal}, shutting down gracefully...`);

  if (!server) {
    process.exit(0);
    return;
  }

  // 1) 停止接受新连接
  server.close(() => {
    console.log('> HTTP server closed.');
  });

  // 2) 给 Next.js 一点时间处理完进行中的请求
  //    10s 后强制退出，防止卡死
  const forceExit = setTimeout(() => {
    console.error('> Force exit after 10s timeout.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    await app.close();
    console.log('> Next.js app closed.');
    process.exit(0);
  } catch (err) {
    console.error('> Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

app.prepare()
  .then(() => {
    server = createServer(async (req, res) => {
      try {
        const parsedUrl = parse(req.url || '/', true);
        await handle(req, res, parsedUrl);
      } catch (err) {
        console.error('Error occurred handling', req.url, err);
        res.statusCode = 500;
        res.end('Internal server error');
      }
    });
    server.on('error', err => {
      console.error(err);
      process.exit(1);
    });
    server.listen(port, hostname, () => {
      console.log(
        `> Server listening at http://${hostname}:${port} as ${
          dev ? 'development' : 'production'
        }`
      );
    });
  })
  .catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
