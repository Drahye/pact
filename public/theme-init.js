/* Set the theme before first paint so the app never flashes the wrong one. Keep in step with src/theme/ThemeProvider.tsx. */
(function () {
  var theme = 'light';
  try {
    if (/^\/(app|styleguide)(\/|$)/.test(location.pathname)) {
      var t = localStorage.getItem('pact.theme');
      theme = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
  } catch (e) {}
  document.documentElement.dataset.theme = theme;
  if (theme === 'dark') {
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#0F1512');
    document.querySelector('meta[name="color-scheme"]').setAttribute('content', 'dark');
  }
})();
