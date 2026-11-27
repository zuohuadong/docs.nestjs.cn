<!-- 此文件从 content/security/encryption-hashing.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:38:22.848Z -->
<!-- 源文件: content/security/encryption-hashing.md -->
<!-- 源哈希: 85557c149106535b5021f2bca0ee37e0 -->

### 加密和哈希

**加密**是编码信息的过程。此过程将信息的原始表示，称为明文，转换为另一种形式，称为密文。理想情况下，只有授权方才能将密文解密回明文并访问原始信息。加密本身不能阻止干扰，但它能阻止潜在拦截者获取可理解的内容。加密是双向函数：使用正确的密钥可以解密加密的内容。

**哈希**是将给定密钥转换为另一个值的过程。哈希函数根据数学算法生成新值。一旦值被哈希，就应该不可能从输出反推回输入。

#### 加密

Node.js 提供了一个内置的[crypto module](https://nodejs.org/api/crypto.html)，可用于加密和解密字符串、数字、缓冲区、流等。Nest 没有在此模块之上提供额外的包，以避免引入不必要的抽象。

例如，我们使用 AES（高级加密标准）`'aes-256-ctr'` 算法，该算法使用 CTR 加密模式。

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

要解密`encryptedText` 值：

```typescript
import { createDecipheriv } from 'node:crypto';

const decipher = createDecipheriv('aes-256-ctr', key, iv);
const decryptedText = Buffer.concat([
  decipher.update(encryptedText),
  decipher.final(),
]);

```

#### 哈希

要哈希密码，请使用来自[`@nestjs/authentication`](/security/authentication) 的`PasswordHasher`。它使用来自`node:crypto` 的 scrypt 进行哈希，采用 OWASP 推荐的参数（N=2^17, r=8, p=1：每个哈希约 128 MiB 内存），在 libuv 线程池上执行，因此不会阻塞事件循环，也不需要原生依赖。scrypt 是内存密集型的，这使得在 GPU 上猜测密码的成本远高于使用 bcrypt。

当应用程序导入`AuthenticationModule` 时，`PasswordHasher` 是一个提供者，因此在存储和检查密码的地方注入它：

```typescript
import { Injectable } from '@nestjs/common';
import { PasswordHasher } from '@nestjs/authentication';

@Injectable()
export class CredentialsService {
  constructor(private readonly passwordHasher: PasswordHasher) {}

  async hashPassword(password: string) {
    return this.passwordHasher.hash(password);
  }

  async checkPassword(password: string, storedHash: string | undefined) {
    return this.passwordHasher.verify(password, storedHash);
  }
}

```

- `hash()` 返回一个自描述的字符串，例如`$scrypt$ln=17,r=8,p=1$<salt>$<hash>`：参数和随机盐与哈希一起存储，因此无需保留其他信息。
- `verify()` 以恒定时间进行比较。对于未知用户，传入`undefined`：它会检查一个虚拟哈希，因此响应时间不会泄露存在的账户信息。
- 密码在哈希前会进行 Unicode 规范化（NFKC），因此在不同键盘上输入的相同密码可以验证。
- `hash()` 拒绝空密码和超过 4 KiB 的密码，并使用`RangeError` 进行处理，而`verify()` 对它们返回`false` 而不进行哈希。任何其他规则，如最小长度，需要您首先检查。
- `needsRehash()` 会告知您存储的哈希是使用弱于当前参数生成的。在成功`verify()` 后检查它，并在拥有明文时存储新哈希：

```typescript
if (this.passwordHasher.needsRehash(storedHash)) {
  await this.usersRepository.updatePasswordHash(user.id, await this.passwordHasher.hash(password));
}

```

成本来自于模块的`password` 选项：将其`logN` 设置为 18 以加倍成本。它有 1 GiB 的内存上限和默认每哈希工作量的 16 倍，因此使用默认的`r` 8，`logN` 停止在 20；超出此参数的哈希器创建时会抛出错误，并且使用这些参数生成的存储哈希将永远无法验证。在模块外部，使用`new PasswordHasher()` 自行创建一个。在测试中，使用成本更低的实例可以保持套件运行快速，将`logN` 设置为 10。

> info **提示** 如果您更愿意使用 argon2 或 bcrypt，[argon2](https://www.npmjs.com/package/argon2) 和 [bcrypt](https://www.npmjs.com/package/bcrypt) 包与 Nest 配合使用，因为它们是：从您自己的提供者中调用它们的`hash()` 和 `verify()`（argon2）或`compare()`（bcrypt）函数。两者都是原生模块，并且 bcrypt 只读取密码的前 72 字节。