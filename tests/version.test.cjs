const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const F=require('../shared.js');
test('client release version matches package metadata and has a changelog entry',()=>{
  const pkg=require('../package.json'),lock=require('../package-lock.json');
  assert.equal(F.version,pkg.version);assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
  const changelog=fs.readFileSync(require.resolve('../CHANGELOG.md'),'utf8');
  assert(changelog.split('\n').some(line=>line==='## '+pkg.version));
});
