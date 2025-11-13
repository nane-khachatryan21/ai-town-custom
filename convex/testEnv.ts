/**
 * Test if environment variables are accessible
 */

import { action } from './_generated/server';

export const checkEnv = action({
  handler: async () => {
    console.log('\n========================================');
    console.log('ENVIRONMENT VARIABLE TEST');
    console.log('========================================');
    console.log(`process.env keys: ${Object.keys(process.env).length}`);
    console.log(`ENABLE_WEB_SEARCH = "${process.env['ENABLE_WEB_SEARCH']}"`);
    console.log(`Type: ${typeof process.env['ENABLE_WEB_SEARCH']}`);
    console.log(`Equals 'true': ${process.env['ENABLE_WEB_SEARCH'] === 'true'}`);
    console.log('========================================\n');
    
    return {
      value: process.env['ENABLE_WEB_SEARCH'],
      enabled: process.env['ENABLE_WEB_SEARCH'] === 'true',
      allEnvKeys: Object.keys(process.env).slice(0, 10),
    };
  },
});

