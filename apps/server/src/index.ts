import { loadServerConfig } from './config';
import { CueXGatewayServer } from './gateway/GatewayServer';
import { warmupVoice } from './voice';

const config = loadServerConfig();
const server = new CueXGatewayServer({ config });

if (config.asrMode === 'real') {
  void warmupVoice();
}

const { host, port } = await server.start();
console.log(`[cuex-server] Listening at http://${host}:${port} (WS /ws)`);
console.log(
  `[cuex-server] Modes: S1=${config.system1Mode} S2=${config.system2Mode} ASR=${config.asrMode} (runtimeDir=${config.runtimeDir})`,
);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
