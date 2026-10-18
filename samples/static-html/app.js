document.addEventListener('DOMContentLoaded', () => {
  let count = 0;
  const btn = document.getElementById('counterBtn');
  const countSpan = document.getElementById('count');

  if (btn && countSpan) {
    btn.addEventListener('click', () => {
      count++;
      countSpan.textContent = count;
    });
  }
  console.log('Static application initialized successfully on serverless hosting.');
});
