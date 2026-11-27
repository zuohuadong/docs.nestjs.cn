<!-- 此文件从 content/http/file-upload.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:59:23.449Z -->
<!-- 源文件: content/http/file-upload.md -->
<!-- 源哈希: dff787eab9e858b012a1e96ad23292f8 -->

### 文件上传与流式传输

本章涵盖双向文件处理：接收客户端上传的文件，以及将文件返回给客户端（[streaming files](#streaming-files)）。

> info **提示** 要实现带有类型和大小检查、S3 存储、配额和过期链接的完整上传服务，请遵循 [Build a file upload service in Node.js](/tutorials/file-uploads)。

要处理文件上传，Nest 为 Express 提供了一个基于 [multer](https://github.com/expressjs/multer) 中间件包的内置模块。Multer 处理在 `multipart/form-data` 格式中发布的数据，该格式主要用于通过 HTTP `POST` 请求上传文件。该模块是完全可配置的，因此您可以根据应用程序的要求调整其行为。

> warning **警告** Multer 无法处理非 `multipart/form-data` 格式的数据。

> info **提示** 如果您的应用程序运行在 `FastifyAdapter` 上，则可以使用来自 `@nestjs/platform-fastify` 包的相同拦截器，该包基于 [@fastify/multipart](https://github.com/fastify/fastify-multipart) 而非 Multer，并且本章中描述的装饰器和管道保持不变。仅导入路径发生变化——请参阅下面的 [Fastify](/techniques/file-upload#fastify) 部分。

> info **提示** 如果您的应用程序运行在 `NodeAdapter` 上，请从 `@nestjs/platform-node` 导入拦截器和 `MulterModule`，而不是从 `@nestjs/platform-express` 导入。它们是相同的基于 Multer 的拦截器，因此本章中的所有内容保持不变。

为了类型安全，请安装 Multer 类型定义：

```shell
$ npm i -D @types/multer

```

安装此包后，您可以使用 `Express.Multer.File` 类型（使用 `import { Express } from 'express'` 导入 `Express` 命名空间）。

#### 基本示例

要上传单个文件，请将 `FileInterceptor()` 拦截器绑定到路由处理器，并使用 `@UploadedFile()` 装饰器从请求中提取文件。

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
uploadFile(@UploadedFile() file: Express.Multer.File) {
  console.log(file);
}

```

> info **提示** `FileInterceptor()` 装饰器从 `@nestjs/platform-express` 包导出。`@UploadedFile()` 装饰器从 `@nestjs/common` 导出。

`FileInterceptor()` 装饰器接受两个参数：

- `fieldName`：包含文件的 HTML 表单字段的名称
- `options`：一个可选的 `MulterOptions` 类型对象。该对象与 Multer 构造函数接受的对象相同（参见 [Multer options](https://github.com/expressjs/multer#multeropts)）。

> warning **警告** `FileInterceptor()` 可能与 Google Firebase 等第三方云提供商不兼容。

#### 文件验证

您通常会想验证传入的文件元数据，例如文件大小或 MIME 类型。为此，请创建一个 [pipe](/pipes) 并将其绑定到用 `@UploadedFile()` 装饰的参数上。以下示例实现了一个基本的文件大小验证管道：

```typescript
import { PipeTransform, Injectable, ArgumentMetadata } from '@nestjs/common';

@Injectable()
export class FileSizeValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    // "value" is an object containing the file's attributes and metadata
    const oneKb = 1000;
    return value.size < oneKb;
  }
}

```

像下面这样与 `FileInterceptor` 一起使用：

```typescript
@Post('file')
@UseInterceptors(FileInterceptor('file'))
uploadFileAndValidate(@UploadedFile(
  new FileSizeValidationPipe(),
  // other pipes can be added here
) file: Express.Multer.File, ) {
  return file;
}

```

对于常见情况，Nest 提供了一个内置管道 `ParseFilePipe`，它还标准化了添加新文件验证的方式：

```typescript
@Post('file')
uploadFileAndPassValidation(
  @Body() body: SampleDto,
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        // ... Set of file validator instances here
      ]
    })
  )
  file: Express.Multer.File,
) {
  return {
    body,
    file: file.buffer.toString(),
  };
}

```

`ParseFilePipe` 需要一个文件验证器数组来执行。验证器接口在下面描述。该管道还接受两个**可选**选项：

<table>
  <tr>
    <td><code>errorHttpStatusCode</code></td>
    <td>当 <b>任何</b>验证器失败时抛出的 HTTP 状态码。默认为 <code>400</code>（BAD REQUEST）</td>
  </tr>
  <tr>
    <td><code>exceptionFactory</code></td>
    <td>一个接收错误消息并返回错误的工厂。</td>
  </tr>
</table>

此管道使用的验证器是内置实现或您自己对抽象 `FileValidator` 类的子类：

```typescript
export abstract class FileValidator<TValidationOptions = Record<string, any>> {
  constructor(protected readonly validationOptions: TValidationOptions) {}

  /**
   * Indicates if this file should be considered valid, according to the options passed in the constructor.
   * @param file the file from the request object
   */
  abstract isValid(file?: any): boolean | Promise<boolean>;

  /**
   * Builds an error message in case the validation fails.
   * @param file the file from the request object
   */
  abstract buildErrorMessage(file: any): string;
}

```

> info **提示** `isValid()` 方法可以是异步的。为了类型安全，在使用 Express（默认 HTTP 适配器）时，将 `file` 参数指定为 `Express.Multer.File`。

一个 `FileValidator` 接收文件对象，并根据传递给其构造函数的选项进行验证。Nest 提供了两个内置实现：

- `MaxFileSizeValidator` 检查文件大小是否小于提供的字节值。
- `FileTypeValidator` 检查文件的 MIME 类型是否与给定字符串或正则表达式匹配。默认情况下，它从文件内容的 [magic number](https://www.ibm.com/support/pages/what-magic-number) 中确定 MIME 类型。

以下代码片段使用 `ParseFilePipe` 同时使用了这两个验证器：

```typescript
@UploadedFile(
  new ParseFilePipe({
    validators: [
      new MaxFileSizeValidator({ maxSize: 1000 }),
      new FileTypeValidator({ fileType: 'image/jpeg' }),
    ],
  }),
)
file: Express.Multer.File,

```

> info **提示** 如果验证器列表很长，请在一个单独的文件中定义该数组，并将其作为命名常量导入，例如 `fileValidators`。

或者，使用 `ParseFilePipeBuilder` 类组合验证器。构建器为您实例化每个验证器，因此您只需传递它们的选项：

```typescript
@UploadedFile(
  new ParseFilePipeBuilder()
    .addFileTypeValidator({
      fileType: 'jpeg',
    })
    .addMaxSizeValidator({
      maxSize: 1000
    })
    .build({
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY
    }),
)
file: Express.Multer.File,

```

> info **提示** 默认情况下需要文件。要使其可选，请在 `build()` 方法的选项中传递 `fileIsRequired: false`（紧邻 `errorHttpStatusCode`）。

#### 文件数组

要上传由单个字段名称标识的文件数组，请使用 `FilesInterceptor()` 装饰器（注意名称中的复数 **Files**）。它接受三个参数：

- `fieldName`：如上所述
- `maxCount`：一个可选的最大文件数量
- `options`：一个可选的 `MulterOptions` 对象，如上所述

在使用 `FilesInterceptor()` 时，使用 `@UploadedFiles()` 装饰器从 `request` 中提取文件。

```typescript
@Post('upload')
@UseInterceptors(FilesInterceptor('files'))
uploadFile(@UploadedFiles() files: Array<Express.Multer.File>) {
  console.log(files);
}

```

> info **提示** `FilesInterceptor()` 装饰器从 `@nestjs/platform-express` 包导出。`@UploadedFiles()` 装饰器从 `@nestjs/common` 导出。

#### 验证文件数组

要验证上传的文件数组，请将使用 `ParseFilePipeBuilder` 构建的管道传递给 `@UploadedFiles()` 装饰器。注册的验证器将针对数组中的每个文件运行。

```typescript
@Post('upload')
@UseInterceptors(FilesInterceptor('files', 5))
uploadFiles(
  @UploadedFiles(
    new ParseFilePipeBuilder()
      .addFileTypeValidator({
        fileType: /^image\/(jpeg|png|gif)$/,
      })
      .addMaxSizeValidator({ maxSize: 5242880 })
      .build({
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      }),
  )
  files: Array<Express.Multer.File>,
) {
  console.log(files);
}

```

#### 多个文件

要在不同的字段名称下上传多个文件，请使用 `FileFieldsInterceptor()` 装饰器。它接受两个参数：

- `uploadedFields`：一个对象数组，每个对象都有必需的 `name` 属性（字段名称）和一个可选的 `maxCount` 属性
- `options`：一个可选的 `MulterOptions` 对象，如上所述

在使用 `FileFieldsInterceptor()` 时，使用 `@UploadedFiles()` 装饰器从 `request` 中提取文件。

```typescript
@Post('upload')
@UseInterceptors(FileFieldsInterceptor([
  { name: 'avatar', maxCount: 1 },
  { name: 'background', maxCount: 1 },
]))
uploadFile(@UploadedFiles() files: { avatar?: Express.Multer.File[], background?: Express.Multer.File[] }) {
  console.log(files);
}

```

#### 任意文件

要接受任何字段名称下的文件，请使用 `AnyFilesInterceptor()` 装饰器。它接受一个可选的 `options` 对象，如上所述。

在使用 `AnyFilesInterceptor()` 时，使用 `@UploadedFiles()` 装饰器从 `request` 中提取文件。

```typescript
@Post('upload')
@UseInterceptors(AnyFilesInterceptor())
uploadFile(@UploadedFiles() files: Array<Express.Multer.File>) {
  console.log(files);
}

```

#### 无文件

要接受 `multipart/form-data` 而不允许文件上传，请使用 `NoFilesInterceptor`。它将 multipart 字段设置为请求体的属性。包含文件的请求将以 `BadRequestException` 拒绝。

```typescript
@Post('upload')
@UseInterceptors(NoFilesInterceptor())
handleMultiPartData(@Body() body) {
  console.log(body)
}

```

#### 默认选项

您可以将 Multer 选项传递给每个文件拦截器，如上所述。要设置默认选项，请在导入 `MulterModule` 时调用静态 `register()` 方法。它接受所有 [Multer options](https://github.com/expressjs/multer#multeropts)。

```typescript
MulterModule.register({
  dest: './upload',
});

```

> info **提示** `MulterModule` 类从 `@nestjs/platform-express` 包导出。

传递给文件拦截器的选项优先于这些默认值。从 NestJS v12.0.4 开始，两个 `limits` 对象会按键合并，因此仅设置 `limits.fileSize` 的路由会保留 `limits.files` 等默认值。如果其中一个是函数，拦截器的 `limits` 将完全替换默认值。从 NestJS v12.5 开始，路由选项或限制是 `undefined` 或 `null` 的，例如未设置的配置值，则会被忽略，因此保留模块的值。要提升单个路由的模块限制，请将其设置为 `Infinity`。

#### 异步配置

要异步而不是静态地设置 `MulterModule` 选项，请使用 `registerAsync()` 方法。与大多数动态模块一样，它支持几种异步配置技术。

一种技术是使用工厂函数：

```typescript
MulterModule.registerAsync({
  useFactory: () => ({
    dest: './upload',
  }),
});

```

像其他 [factory providers](/fundamentals/dependency-injection#工厂提供者usefactory) 一样，工厂函数可以是 `async`，并且可以通过 `inject` 注入依赖。

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useFactory: async (configService: ConfigService) => ({
    dest: configService.get<string>('MULTER_DEST'),
  }),
  inject: [ConfigService],
});

```

或者，您可以像下面所示使用类而不是工厂来配置 `MulterModule`：

```typescript
MulterModule.registerAsync({
  useClass: MulterConfigService,
});

```

上述构造在 `MulterModule` 内部实例化 `MulterConfigService` 并调用其 `createMulterOptions()` 方法以获取选项对象。要使此工作，`MulterConfigService` 必须实现 `MulterOptionsFactory` 接口：

```typescript
@Injectable()
class MulterConfigService implements MulterOptionsFactory {
  createMulterOptions(): MulterModuleOptions {
    return {
      dest: './upload',
    };
  }
}

```

如果您想重用现有的选项提供者而不是在 `MulterModule` 内部创建私有副本，请使用 `useExisting` 语法。

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useExisting: ConfigService,
});

```

您也可以将 `extraProviders` 传递给 `registerAsync()` 方法。这些提供者会与模块的提供者合并。

```typescript
MulterModule.registerAsync({
  imports: [ConfigModule],
  useClass: ConfigService,
  extraProviders: [MyAdditionalProvider],
});

```

当工厂函数或类构造函数需要额外的依赖项时，这非常有用。

#### 内存使用和存储

默认情况下，Multer 使用其内存存储引擎（`memoryStorage()`）：每个上传的文件都会完全读入内存，并在路由处理程序运行之前作为 `Buffer` 暴露在 `file.buffer` 上。这对于小文件（头像或 CSV 导入）很方便，但每个正在传输的上传都会占用与其大小相同的内存，因此大文件或大量并发上传会迅速耗尽进程的内存。

> warning **警告** Multer 默认不限制上传文件的大小。当您将文件保留在内存中时，请始终设置 `limits.fileSize`。

##### 文件大小限制

使用 `limits` 选项来拒绝过大的文件。当超过限制时，Nest 会返回 `413 File too large` 错误（对于 `fileSize`）或 `400 Bad Request`（对于其他限制，如 `files`），并且路由处理程序不会被调用。

```typescript
@Post('upload')
@UseInterceptors(
  FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  }),
)
uploadFile(@UploadedFile() file: Express.Multer.File) {
  console.log(file.size);
}

```

> info **提示** 与在整个文件接收后运行的 `MaxFileSizeValidator` 不同，`limits.fileSize` 会在达到限制时使 Multer 停止存储文件并拒绝请求，因此超大文件永远不会完全到达内存或磁盘。有关完整选项列表，请参阅 [Multer limits](https://github.com/expressjs/multer#limits)。

从 NestJS v12.5 开始，请求中的部分数量（文本字段和文件总计，`limits.parts`）默认为 1000，与 Fastify 一致，如果请求超过此数量，将以 `400 Too many parts` 拒绝。这也限制了 `limits.fields`、`limits.files` 或 `maxCount` 不超过 1000，除非提高了 `limits.parts`。将其设置为 `Infinity` 以解除限制。

##### 字段名称限制

像 `user[address][city]` 或 `tags[2]` 这样的字段名称会在请求体中构建嵌套对象和数组。有两个限制约束了它们：`fieldNestingDepth`（嵌套级别数，`a[b][c]` 为 2）和 `fieldArrayIndexLimit`（最高数组索引，`tags[2]` 使用索引 2）。任何超过这些限制的请求都将以 `400 Bad Request` 响应被拒绝。从 NestJS v12.2 开始，它们的默认值分别为 32 和 1000（Multer 保持无限），因此单个请求无法构建任意深度的主体或巨大的数组。将其设置为 `Infinity` 以解除限制。

##### 磁盘存储

为保持内存使用量与文件大小无关，使用 `diskStorage()` 引擎将上传写入磁盘。然后 Multer 会在文件到达时将其流式传输到磁盘，并且文件对象暴露 `destination`、`filename` 和 `path`，而不是 `buffer`。

```typescript
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { diskStorage } from 'multer';

@Post('upload')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        cb(null, `${randomUUID()}${extname(file.originalname)}`);
      },
    }),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  }),
)
uploadFile(@UploadedFile() file: Express.Multer.File) {
  console.log(file.path);
}

```

> info **提示** `diskStorage()` 和 `memoryStorage()` 函数从 `multer` 包导出。作为简写，将 `dest: './uploads'` 传递给在随机名称下将文件存储到磁盘。如果您传递一个函数而不是字符串，则您负责创建目录。

要将相同的存储和限制应用于模块中的每个文件拦截器，请将其设置为 [default options](/techniques/file-upload#默认选项) 或使用 [async configuration](/techniques/file-upload#异步配置)。

存储在磁盘上的文件在路由处理程序运行后不会自动删除。一旦处理完成（包括处理失败时），请删除它们（例如使用来自 `fs/promises` 的 `unlink()`）。从 NestJS v12.2 开始，如果管道拒绝了请求（例如，因为 `ParseFilePipe` 验证失败），则不会运行路由处理程序，并且在发送错误响应后会删除存储的文件。

##### 发送文件到外部存储

要在 S3、Cloudflare R2 或其他外部存储中存储上传文件，而无需在内存中缓冲或写入临时文件，请使用一个在文件到达时将其流式传输到目标位置的存储引擎。[`@nestjs/storage`](/application/file-storage) 包提供了一个这样的引擎，即 `uploadToDisk()`，您将其作为 `FileInterceptor()` 的 `storage` 选项传递。参见 [Upload product photos](/application/file-storage#upload-product-photos)。任何其他 Multer [storage engine](https://github.com/expressjs/multer/blob/main/StorageEngine.md) 都以相同方式工作。

> info **提示** 在 `FastifyAdapter` 上，您也可以在路由处理程序内部使用 `FileStreamInterceptor()` 接收文件流。参见 [Streaming uploads](/techniques/file-upload#streaming-uploads)。

#### Fastify

从 NestJS v12.1 开始，在 `FastifyAdapter` 上运行的应用程序（参见 [Fastify adapter](/techniques/performance#fastify-adapter)）可以使用相同的 API 处理文件上传，该 API 由 [@fastify/multipart](https://github.com/fastify/fastify-multipart) 插件提供支持，而不是 Multer。本章中描述的拦截器接受相同的参数和选项，以相同的方式填充 ⟦Request⟧，并以相同的错误响应失败，而 `@UploadedFile()`、`@UploadedFiles()`、`ParseFilePipe`、`ParseFilePipeBuilder` 和内置的文件验证器保持不变。

首先，安装插件：

```bash
$ npm i @fastify/multipart

```

无需注册它：一旦应用程序使用其中一个上传拦截器，`FastifyAdapter` 就会自动注册该插件（在不使用此类拦截器的应用程序中，它根本不会被注册）。如果未安装该包，应用程序将以名称错误启动失败。

接下来，从 `@nestjs/platform-fastify/multipart` 而不是 `@nestjs/platform-express` 导入拦截器。控制器其余部分保持不变，只是文件被类型化为 `UploadedMultipartFile`：

```typescript
import {
  Controller,
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileInterceptor,
  type UploadedMultipartFile,
} from '@nestjs/platform-fastify/multipart';

@Controller('files')
export class FilesController {
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1000 }),
          new FileTypeValidator({ fileType: 'image/png' }),
        ],
      }),
    )
    file: UploadedMultipartFile,
  ) {
    console.log(file);
  }
}

```

> info **提示** 从 `@nestjs/platform-fastify/multipart` 导出的所有内容也从 `@nestjs/platform-fastify` 包根重新导出。拦截器仅与 `FastifyAdapter` 工作：使用 `ExpressAdapter`，应用程序将启动失败，因此请继续从 `@nestjs/platform-express` 导入它们。

下表将 Express API 映射到其 Fastify 对应项：

| `@nestjs/platform-express`                                                                                            | `@nestjs/platform-fastify/multipart`                                                           |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `FileInterceptor()`, `FilesInterceptor()`, `FileFieldsInterceptor()`, `AnyFilesInterceptor()`, `NoFilesInterceptor()` | 相同的名称、参数和选项                                                              |
| `MulterOptions`                                                                                                       | `MultipartOptions`                                                                             |
| `MulterModule`, `MulterOptionsFactory`, `createMulterOptions()`                                                       | `MultipartModule`, `MultipartOptionsFactory`, `createMultipartOptions()`                       |
| `Express.Multer.File`                                                                                                 | `UploadedMultipartFile`                                                                        |
| `memoryStorage()` 和 `diskStorage()` 来自 `multer` 包                                                       | `memoryStorage()` 和 `diskStorage()`                                                          |
| -                                                                                                                     | `FileStreamInterceptor()` (参见 [Streaming uploads](/techniques/file-upload#streaming-uploads)) |

拦截器选项与 Multer 接受的相同：`dest`、`storage`、`limits`（一个对象，或接收 ⟦Request⟧ 并返回一个的函数）、`fileFilter`、`preservePath` 和 `defParamCharset`。上传的文件作为 `req.file` 或 `req.files` 暴露，文本字段作为 `req.body` 暴露，与 Multer 完全相同。`UploadedMultipartFile` 的形状与 `Express.Multer.File` 相同，因此您不需要 `@types/multer` 包。

`MultipartModule` 为导入它的模块的上传拦截器设置默认选项，就像 `MulterModule` 一样。其 `registerAsync()` 方法接受 `useFactory`（带有 `imports` 和 `inject`）、`useClass` 和 `useExisting`。

```typescript
MultipartModule.register({
  dest: './upload',
});

```

##### 存储

与 Multer 一样，除非设置了 `dest` 或 `storage` 选项，否则文件保留在内存中（在 `file.buffer` 中）。`dest` 将每个文件写入给定文件夹下的随机名称，而 `diskStorage()` 函数允许您选择文件夹和文件名。磁盘存储在文件上设置 `destination`、`filename` 和 `path`，而不是 `buffer`。

```typescript
import {
  diskStorage,
  FileInterceptor,
  type UploadedMultipartFile,
} from '@nestjs/platform-fastify/multipart';

@Post('upload')
@UseInterceptors(
  FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, callback) =>
        callback(null, `${Date.now()}-${file.originalname}`),
    }),
  }),
)
uploadFile(@UploadedFile() file: UploadedMultipartFile) {
  console.log(file.path);
}

```

存储引擎遵循 Multer 的存储引擎契约（`_handleFile()` 和 `_removeFile()`），因此可以将 Multer 自己的 `multer.diskStorage()` 和第三方 Multer 存储引擎作为 `storage` 不变地传递。

##### 限制

`@fastify/multipart` 应用比 Multer 更严格的文件大小默认值。除非另有配置，否则最大文件大小（`fileSize`）是 Fastify 的 `bodyLimit`（默认为 1 MiB），而 Multer 不限制它。最大部分数（`parts`）是 1000，与 NestJS v12.5 以来 Multer 一致。较大的文件会以 `413 File too large` 响应被拒绝。您可以提高这些限制：

- 对于单个路由，使用拦截器的 `limits` 选项
- 对于一个模块，使用 `MultipartModule.register()` 或 `registerAsync()`
- 对于整个应用程序，使用 `FastifyAdapter` 的 `multipart` 选项，该选项将选项传递给插件本身：

```typescript
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({
    multipart: { limits: { fileSize: 10 * 1024 * 1024 } },
  }),
);

```

设置在路由上的限制会按键合并到使用 `MultipartModule` 键设置的限制上，并且两者都合并到应用程序范围的限制之上。例外情况是 `fieldNameSize`、`fieldNestingDepth`、`fieldArrayIndexLimit` 和 `jsonFieldsSize`，拦截器不会从插件选项中读取它们——请在路由上设置它们或使用 `MultipartModule`。

使用 `application/json` 内容类型发送的文本字段会解析后到达（参见 [Differences from Multer](/techniques/file-upload#differences-from-multer)）。从 NestJS v12.5 开始，此类字段的 JSON 文本在每个 ⟦Request⟧ 中总共限制为 1 MiB（与默认 Fastify `bodyLimit` 相同），超过此限制的 ⟦Request⟧ 将以 `400 JSON field values too large` 被拒绝。使用 `limits.jsonFieldsSize` 提高它，或将其设置为 `Infinity` 以解除限制。

##### 插件注册

`FastifyAdapter` 的 `multipart` 选项控制了 `@fastify/multipart` 插件的注册方式：

- 未设置（默认）：当使用上传拦截器时，适配器注册插件，除非它已注册
- 一个选项对象（`FastifyMultipartOptions`，例如 `limits`）：当应用程序初始化时，适配器使用这些选项注册插件
- `true`：与上同，使用插件的默认选项
- `false`：适配器从不注册插件，适用于自行注册或使用其他库解析 multipart 请求的应用程序（上传拦截器仍需要 `@fastify/multipart`，如果未注册则应用程序启动失败）

当在依赖注入系统外部实例化上传拦截器时，将该选项设置为 `true`（或传入一个选项对象），例如传递给 `app.useGlobalInterceptors()` 的 `new (FileInterceptor('file'))()`，因为它不会触发自动注册。当上传拦截器仅在应用程序启动后加载的 [lazy-loaded modules](/fundamentals/lazy-loading-modules) 中使用时也适用，因为此时插件已无法注册。

如果您倾向于自行注册插件，请将其传递给 `app.register()`，无论是在 `app.init()` 之前还是之后。适配器会接管此注册，因此插件只注册一次，并且您的选项优先于通过 `multipart` 选项传递的选项：

```typescript
import multipart from '@fastify/multipart';

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

```

> 警告 **警告** 直接在 Fastify 实例（`app.getHttpAdapter().getInstance().register(multipart)`）上注册 `@fastify/multipart`，或将其动态 `import()` 传递给 `app.register()`，仅在 `app.init()` 之前有效（该时间点由 `app.listen()` 调用）。之后，适配器已为您的上传拦截器注册了插件，Fastify 将以 `FST_ERR_DEC_ALREADY_PRESENT` 错误失败。请改用 `app.register(multipart)` 或 `multipart` 选项，或将选项设置为 `false` 来自行管理插件。

##### 流式上传

到目前为止描述的拦截器在路由处理程序运行之前会存储每个文件（在内存中或在磁盘上）。如果希望在文件到达时进行处理，例如将大文件上传管道传输到其最终目的地，请使用 `FileStreamInterceptor()`，该功能仅在 Fastify 上可用。它接受包含文件的字段名称和一个可选的选项对象（与其它拦截器相同，但排除 `dest` 和 `storage`），并将一个具有 `stream` 属性的文件交给路由处理程序，而不是 `buffer`：

```typescript
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  FileStreamInterceptor,
  MultipartFileStream,
} from '@nestjs/platform-fastify/multipart';

@Post('upload')
@UseInterceptors(
  FileStreamInterceptor('file', { limits: { fileSize: 1024 * 1024 * 1024 } }),
)
async uploadFile(@UploadedFile() file: MultipartFileStream, @Body() body) {
  const path = join('uploads', randomUUID());
  await pipeline(file.stream, createWriteStream(path));
  return { originalname: file.originalname, path, body };
}

```

由于文件从未被缓冲，适用以下几条规则：

- 文本字段必须在表单中位于文件之前。在文件之前发送的字段可在 `req.body`（`@Body()`）中获取，而文件之后的部分不会被解析。
- 在给定字段中只接受一个文件。在任何其他字段中的文件将以 `400 Unexpected file field` 响应失败请求。
- 文件大小事先未知，因此不适用 `MaxFileSizeValidator`，也不适用 `FileTypeValidator` 的魔术数字检查（要仅比较客户端提供的 mime 类型，请将其 `skipMagicNumbersValidation` 选项设置为 `true`）。仍会强制执行 `fileSize` 限制：一旦超出，流将以 `PayloadTooLargeException` 错误。
- 路由处理程序未读取的内容在发送响应之前将被丢弃，以便客户端可以完成上传。当处理程序返回 `StreamableFile`（可能是上传本身）时，响应发送后其余的上传内容将被丢弃。因此，如果处理程序响应了除上传以外的 `StreamableFile`，则应先读取上传——否则，仍在连接上上传的客户端可能会以 `EPIPE` 或 `ECONNRESET` 错误失败。

##### 与 Multer 的区别

除了 [default limits](/techniques/file-upload#limits)，Fastify 拦截器与 Multer 的区别如下：

- 接受正好为 `fieldSize` 字节的文本字段，而 Multer 会拒绝它。
- 可能污染原型（`constructor`）的字段名（或包含 `__proto__`、`constructor` 或 `prototype` 段的名称，例如 `user[constructor]`）将以 `400 Invalid field name` 响应失败请求。Multer 会接受它们。
- 使用 `Content-Type: application/json` 头部发送的文本字段会以已解析的形式到达，无效的 JSON 将以 `400` 响应失败请求（一个 `@fastify/multipart` 功能）。格式错误的 part 头部行将被忽略，而 Multer 会以 `400` 响应失败请求。
- `fileFilter` 函数和存储引擎接收 Fastify 请求而不是 Express 请求。
- 不支持 `attachFieldsToBody` 插件选项，因为它在拦截器运行之前就消耗了请求体。
- Multer 的 `highWaterMark`、`fileHwm`、`defCharset` 和 `streamHandler` 选项不受拦截器支持。

#### 示例

可在此处获取文件上传的有效示例 [here](https://github.com/nestjs/nest/tree/master/sample/29-file-upload)。

#### 流式文件

要从路由处理程序发送文件，您可以将流管道传输到响应对象：

```typescript
@Controller('file')
export class FileController {
  @Get()
  getFile(@Res() res: Response) {
    const file = createReadStream(join(process.cwd(), 'package.json'));
    file.pipe(res);
  }
}

```

使用此方法，处理程序接管了响应，因此不再运行控制器后的 [interceptor](/overview/interceptors) 逻辑。相反，返回一个 `StreamableFile` 实例，Nest 会为您将其管道传输到响应中。对于非文件内容，例如 LLM 的令牌，请参阅 [Streaming responses](/http/streaming-responses)。

> info **注意** 流式传输文件适用于 **HTTP 应用程序**。下面的示例不适用于 GraphQL 或微服务应用程序。

##### Streamable 文件类

`StreamableFile` 包含要发送的内容。其构造函数接受一个 `Readable` 流或一个 `Uint8Array`（包括一个 `Buffer`）。下面的示例返回 `package.json` 文件而不是 JSON 响应。相同的方法适用于图像、文档和任何其他文件类型：

```typescript
import { Controller, Get, StreamableFile } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

@Controller('file')
export class FileController {
  @Get()
  getFile(): StreamableFile {
    const file = createReadStream(join(process.cwd(), 'package.json'));
    return new StreamableFile(file);
  }
}

```

> info **提示** `StreamableFile` 类从 `@nestjs/common` 包导出。

既不返回 `ClassSerializerInterceptor` 也不返回 `StandardSchemaSerializerInterceptor` [serializes](/application/serialization) `StreamableFile` 响应。

##### 响应头

默认情况下，`Content-Type` 响应头是 `application/octet-stream`。要更改它，并设置 `Content-Disposition` 和 `Content-Length` 头，请将 `type`、`disposition` 和 `length` 选项传递给 `StreamableFile` 构造函数：

```typescript
@Get()
getFile(): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'package.json'));
  return new StreamableFile(file, {
    type: 'application/json',
    disposition: 'attachment; filename="package.json"',
  });
}

```

当内容是 `Uint8Array` 时，`length` 默认为其大小。对于流，如果您提前知道大小，请自行设置 `length`。

也可以使用 [`@Header()`](/overview/controllers#response-headers) 装饰器设置具有静态值的头：

```typescript
@Get()
@Header('Content-Type', 'application/json')
@Header('Content-Disposition', 'attachment; filename="package.json"')
getFile(): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'package.json'));
  return new StreamableFile(file);
}

```

要在运行时计算头，请启用 `passthrough` 将响应对象注入，这样 Nest 仍然会发送返回的 `StreamableFile`：

```typescript
import type { Response } from 'express';

@Get()
getFile(@Res({ passthrough: true }) res: Response): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'package.json'));
  res.set({
    'Content-Type': 'application/json',
    'Content-Disposition': 'attachment; filename="package.json"',
  });
  return new StreamableFile(file);
}

```

##### 流错误

使用 Express 适配器时，如果流在发送任何数据之前发出错误，客户端将收到 `400 Bad Request` 响应，并且错误会被记录。从 NestJS v12.2 开始，响应体不再包含错误消息，其中可能包括文件路径。如果数据已发送，响应将被结束。要自定义此行为，请向 `setErrorHandler()` 方法传递一个处理程序：

```typescript
@Get()
getReport(): StreamableFile {
  const file = createReadStream(join(process.cwd(), 'report.pdf'));
  return new StreamableFile(file).setErrorHandler((err, res) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 404;
    res.send('Report not found');
  });
}

```

`setErrorLogger()` 方法替换了记录错误的函数：即默认错误处理程序响应的错误，以及响应流在写入文件时发出的错误。

> info **注意** 错误处理程序和错误记录器适用于 Express 和 Node 适配器。使用 Fastify 适配器时，流错误由 [exceptions layer](/overview/exception-filters) 处理，因此默认情况下客户端会收到 `500 Internal Server Error` 响应。

##### 跨平台支持

Fastify 可以在没有 `stream.pipe(res)` 的情况下发送流，因此在使用 Fastify 时，`StreamableFile` 类并非严格必需。然而，Nest 在两个平台上都支持 `StreamableFile`，因此返回它的代码在在 Express 和 Fastify 之间切换时保持不变。