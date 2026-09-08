// Keep the recovery screen available if downloading or initializing the app fails.
import('./main.js').then(async module => {
  await module.ready;
  window.pitBoot.ready();
}).catch(error => {
  console.error('PIT DETAIL could not start:', error);
  window.pitBoot.failed();
});
