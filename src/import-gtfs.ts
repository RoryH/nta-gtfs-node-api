import { importGtfs } from 'gtfs';
import { readFile, writeFile, link, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { GtfsConfig } from './types';

const lastUpdateConfigFile = './last-update.json';
const lastUpdateConfigKey = 'lastUpdate';

export default async function maybeImportGtfs(config: GtfsConfig) {
  const oldDbPath = `${config.sqlitePath}.old`;

  if (existsSync(lastUpdateConfigFile) && existsSync(`./${config.sqlitePath}`)) {
    console.log('Reading last update config file');
    const config = JSON.parse(
      await readFile(lastUpdateConfigFile, { encoding: 'utf8' })
    );
    if (config[lastUpdateConfigKey]) {
      console.log(`GTFS DB last updated: ${config[lastUpdateConfigKey]}`);
      const lastUpdate = new Date(config[lastUpdateConfigKey]);
      if ((Date.now() - lastUpdate.getTime()) < 1000 * 60 * 60 * 24 * 7) {
        return;
      }
      console.log('   ...updating');
    }
  }

  if (existsSync(`./${config.sqlitePath}`)) {
    await link(`./${config.sqlitePath}`, `./${oldDbPath}`);
    await unlink(`./${config.sqlitePath}`);
  }

  return importGtfs(config)
    .then(async () => {
      if (existsSync(`./${oldDbPath}`)) {
        await unlink(`./${oldDbPath}`);
      }
      await writeFile(lastUpdateConfigFile, JSON.stringify({ [lastUpdateConfigKey]: (new Date()).toISOString() }), { encoding: 'utf8' });
      await new Promise((resolve) => {
        // timeout to prevent SQLITE_BUSY errors
        setTimeout(resolve, 1000);
      })
    })
    .catch(async (err: Error) => {
      if (existsSync(`./${oldDbPath}`)) {
        await link(`./${oldDbPath}`, `./${config.sqlitePath}`);
        await unlink(`./${oldDbPath}`);
      }
      console.error(err);
    });
}