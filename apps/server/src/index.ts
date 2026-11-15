import { loadServerConfig } from './config';
import { CueXGatewayServer } from './gateway/GatewayServer';
import { warmupVoice } from './voice';

const config = loadServerConfig();
const server = new CueXGatewayServer({ config });

if (config.asrMode === 'real') {
  void warmupVoice();
}

const { host, port } = await server.start();
server.logger.info('server.started', {
  host,
  port,
  env: config.environment,
  authRequired: config.authRequired,
  system1Mode: config.system1Mode,
  system2Mode: config.system2Mode,
  asrMode: config.asrMode,
  sqlitePath: config.sqlitePath,
});

const shutdown = async (signalName: string) => {
  server.logger.info('server.stopping', { signal: signalName });
  await server.stop();
  server.logger.info('server.stopped', {});
  process.exit(0);
};

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
