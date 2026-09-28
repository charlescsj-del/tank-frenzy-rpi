const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../shared.js');
test('client release version matches package metadata and has a changelog entry',()=>{
  const pkg=require('../package.json'),lock=require('../package-lock.json');
  assert.equal(F.version,pkg.version);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  const changelog=fs.readFileSync(require.resolve('../CHANGELOG.md'),'utf8');
  const release=pkg.version.replace(/-dev$/,'');
  assert(changelog.split('\n').some(line=>line.startsWith('## v'+release+' [')&&/^## v\d+\.\d+\.\d+ \[\d{4}-\d{2}-\d{2}\]$/.test(line)));
});
