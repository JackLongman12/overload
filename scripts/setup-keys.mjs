// One-time: creates the release signing keystore and the update-signing key in keys/ (gitignored).
// BACK UP THE keys/ FOLDER. Losing it means future APKs can't update existing installs,
// and you can't publish over-the-air updates any more.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { execFileSync } from 'node:child_process';
fs.mkdirSync('keys', { recursive: true });
const jdkDir = 'C:/Program Files/Microsoft';
const jdk = fs.readdirSync(jdkDir).filter(d => /^jdk-21/.test(d)).sort().pop();
const keytool = path.join(jdkDir, jdk, 'bin', 'keytool.exe');
if (!fs.existsSync('keys/overload-release.jks')) {
  const pass = crypto.randomBytes(18).toString('base64url');
  execFileSync(keytool, ['-genkeypair', '-keystore', 'keys/overload-release.jks', '-alias', 'overload', '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-storepass', pass, '-keypass', pass, '-dname', 'CN=Overload'], { stdio: 'ignore' });
  fs.writeFileSync('keys/keystore.properties', `storeFile=${path.resolve('keys/overload-release.jks').split(path.sep).join('/')}\nstorePassword=${pass}\nkeyAlias=overload\nkeyPassword=${pass}\n`);
  console.log('Created keys/overload-release.jks');
}
if (!fs.existsSync('keys/update-private.pem')) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.writeFileSync('keys/update-private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const spki = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  fs.writeFileSync('www/js/updatekey.js', `// Public key that verifies update.json signatures (private key lives in keys/, never committed)\nconst UPDATE_PUBLIC_KEY = '${spki}';\n`);
  console.log('Created keys/update-private.pem and www/js/updatekey.js');
}
