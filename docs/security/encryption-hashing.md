<!-- 此文件从 content/security/encryption-hashing.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:46:22.984Z -->
<!-- 源文件: content/security/encryption-hashing.md -->
<!-- 源哈希: 0197dfce2238553f00c0c62a145fb296 -->

### 加密与哈希

**加密**是对信息进行编码的过程。此过程将信息的原始表示（称为明文）转换为另一种形式（称为密文）。理想情况下，只有授权方才能将密文解密回明文并访问原始信息。加密本身并不能阻止干扰，但会拒绝潜在的拦截者获取可理解的内容。加密是一个双向函数；加密的内容可以使用正确的密钥进行解密。

**哈希**是将给定键转换为另一个值的过程。哈希函数根据数学算法生成新值。一旦完成哈希，就不可能从输出反推输入。

#### 加密

Node.js 提供了一个内置的 [crypto module](https://nodejs.org/api/crypto.html)，您可以使用它来加密和解密字符串、数字、缓冲区、流等。Nest 本身没有在此模块之上提供任何额外的包，以避免引入不必要的抽象。

例如，让我们使用 AES（高级加密系统）`'aes-256-ctr'` 算法的 CTR 加密模式。

```typescript
import { createCipheriv, randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const iv = randomBytes(16);
const password = 'Password used to generate key';

// The key length is dependent on the algorithm.
// In this case for aes256, it is 32 bytes.
const key = (await promisify(scrypt)(password, 'salt', 32)) as Buffer;
const cipher = createCipheriv('aes-256-ctr', key, iv);

const textToEncrypt = 'Nest';
const encryptedText = Buffer.concat([
  cipher.update(textToEncrypt),
  cipher.final(),
]);

```

现在解密 `encryptedText` 值：

```typescript
import { createDecipheriv } from 'node:crypto';

const decipher = createDecipheriv('aes-256-ctr', key, iv);
const decryptedText = Buffer.concat([
  decipher.update(encryptedText),
  decipher.final(),
]);

```

#### 哈希

对于哈希，我们建议使用 [bcrypt](https://www.npmjs.com/package/bcrypt) 或 [argon2](https://www.npmjs.com/package/argon2) 包。Nest 本身没有在这些模块之上提供任何额外的包装器，以避免引入不必要的抽象（使学习曲线更短）。

例如，让我们使用 `bcrypt` 来哈希一个随机密码。

首先，安装所需的包：

```shell
$ npm i bcrypt
$ npm i -D @types/bcrypt

```

安装完成后，您可以按如下方式使用 `hash` 函数：

```typescript
import bcrypt from 'bcrypt';

const saltOrRounds = 10;
const password = 'random_password';
const hash = await bcrypt.hash(password, saltOrRounds);

```

要生成盐值，请使用 `genSalt` 函数：

```typescript
const salt = await bcrypt.genSalt();

```

要比较/检查密码，请使用 `compare` 函数：

```typescript
const isMatch = await bcrypt.compare(password, hash);

```

您可以在 [here](https://www.npmjs.com/package/bcrypt) 阅读更多关于可用函数的信息。