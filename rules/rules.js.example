export default [
  {
    match: (v) =>
      v.includes('pip') &&
      v.includes('install') &&
      !v.includes('uv pip') &&
      !v.includes('uvx'),
    reject: true,
    prompt: 'Use `uvx` or `uv venv` + `uv pip` instead of `pip install` directly',
  },
  {
    match: (v) => v.includes('curl') && v.includes('api.github.com'),
    prompt: 'Prefer using `gh` cli over `curl https://api.github.com/...`. gh offers more requests limits.',
  },
  {
    match: (v) => v.includes('pdf'),
    prompt: 'Use the `markitdown` skill to read PDF files.',
  },
  // add your rules here
]
