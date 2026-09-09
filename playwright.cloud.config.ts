import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/cloud-e2e',workers:1,timeout:90000,
 projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}],
 use:{baseURL:'http://127.0.0.1:8787',viewport:{width:390,height:844},trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:[
  {command:'npx wrangler dev --port 8787 --ip 127.0.0.1',url:'http://127.0.0.1:8787',reuseExistingServer:false,timeout:120000},
  {command:'npx wrangler dev --config cloud/admin/wrangler.jsonc --port 8788 --ip 127.0.0.1',url:'http://127.0.0.1:8788',reuseExistingServer:false,timeout:120000},
 ],reporter:'list',
});
