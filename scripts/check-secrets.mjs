import { execFileSync } from 'node:child_process';
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const rules = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const failures = [];
for (const path of paths) {
  if (
    /(^|\/)\.env(?!\.example$)/.test(path) ||
    /(^|\/)\.dev\.vars/.test(path) ||
    /(^|\/)(?:\.hoop-forge-device\.json|\.wrangler|\.sites-runtime)(\/|$)/.test(path)
  ) {
    failures.push(path + ': private runtime file');
  }
  const staged = execFileSync('git', ['show', ':' + path], { maxBuffer: 16 * 1024 * 1024 });
  if (rules.some((rule) => rule.test(staged.toString('utf8')))) {
    failures.push(path + ': possible credential');
  }
}
if (failures.length) {
  console.error('检查未通过（不显示疑似密钥内容）：\n' + failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('已检查 ' + paths.length + ' 个已跟踪/暂存文件，未发现受检密钥模式或私有运行文件。');
}
