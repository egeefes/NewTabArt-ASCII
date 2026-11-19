// Only Chromium can run an SVG filter inside backdrop-filter; everyone else gets frosted glass.
if (/Chrome\//.test(navigator.userAgent)) document.documentElement.classList.add("liquid");
