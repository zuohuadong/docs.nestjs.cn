<!-- 此文件从 content/application/file-storage.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:06:32.420Z -->
<!-- 源文件: content/application/file-storage.md -->
<!-- 源哈希: 2fe30a0d8d7d2c44971dcefe4f6dcfb1 -->

### 文件存储

`@nestjs/storage` 在命名磁盘（本地文件夹、S3 或兼容 S3 的存储，如 R2）上保留文件，通过一个 API 提供公共 URL 和签名 URL。

> info **提示** 要基于此包构建完整的上传服务，请遵循 [Build a file upload service in Node.js](/tutorials/file-uploads)。

一个猫粮和用品的在线商店有三种类型的文件。产品照片由员工上传并向所有人展示。发票是 PDF 文件，只有已付款的客户才能下载。仓库团队使用商店的移动应用拍摄产品照片，上传大文件，这些大文件不应通过订单 API。

在开发环境中，所有这些都应从笔记本电脑上的一个文件夹工作。在生产环境中，文件会上传到 S3 或 Cloudflare R2，因为 API 运行在多个实例上，没有一个实例拥有持久的磁盘。存储和提供文件的代码在两者中应保持一致。

`@nestjs/storage` 为每个文件所在的存储位置提供一个名称，即一个**磁盘**，以及一个统一的 API：`put()`、`get()`、`list()`、`delete()`、公共 URL 和签名 URL。它提供一个本地磁盘、一个与 AWS S3 和兼容 S3 存储（Cloudflare R2、MinIO、Backblaze B2）配合使用的 S3 磁盘，以及一个用于测试的内存磁盘。它通过 `fetch` 与 S3 通信，不依赖 AWS SDK，仅依赖 `@nestjs/common` 和 `@nestjs/core`。

它不解析上传。Express 上的 multer 和 Fastify 上的 `@nestjs/platform-fastify/multipart` 仍然这样做，像往常一样使用 `FileInterceptor()`。此包是文件最终存放的地方：它提供一个存储引擎，将每次上传直接流式传输到磁盘。

在本教程中，您将：

- 为照片配置一个公共磁盘，为所有其他内容配置一个私有磁盘，
- 将照片上传流式传输到照片磁盘，在写入任何内容之前检查类型和大小，
- 私密存储发票，并提供在五分钟后过期的下载链接，
- 允许移动应用直接将照片上传到存储，使用签名上传 URL，
- 仅通过配置从本地磁盘切换到 S3 或 R2，
- 使用内存磁盘测试所有功能。

#### 安装

要开始，安装所需的依赖项：

```bash
$ npm i --save @nestjs/storage @nestjs/config

```

#### 配置磁盘

应用程序需要两个磁盘。`photos` 存储产品照片，任何人都可以查看，因此它具有公共 URL。`private` 存储发票和尚未检查的上传，只能通过签名 URL 访问。将公共文件和私有文件放在单独的磁盘上（在生产环境中是单独的存储桶）意味着文件不会意外地变为公共的。

从配置开始，使用 [custom configuration file](/application/configuration#自定义配置文件) 配置 `@nestjs/config`。`STORAGE_DRIVER` 将选择本地磁盘或 S3 [in production](/application/file-storage#use-s3-or-r2-in-production)；在此之前，所有内容都是本地的：

```typescript title="config/configuration.ts"
export default () => ({
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  storage: {
    // 'local' in development, 's3' in production (AWS S3, Cloudflare R2, MinIO...)
    driver: process.env.STORAGE_DRIVER ?? 'local',
    root: process.env.STORAGE_ROOT ?? 'storage',
    signingKey: process.env.STORAGE_SIGNING_KEY,
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? 'auto',
      photosBucket: process.env.S3_PHOTOS_BUCKET ?? 'store-photos',
      privateBucket: process.env.S3_PRIVATE_BUCKET ?? 'store-private',
      photosUrl: process.env.PHOTOS_CDN_URL,
    },
  },
});

```

这些磁盘由工厂函数根据该配置构建：

```typescript title="storage/storage.config.ts"
import { ConfigService } from '@nestjs/config';
import { LocalDisk, type StorageModuleOptions } from '@nestjs/storage';

export function createStorageOptions(config: ConfigService): StorageModuleOptions {
  const appUrl = config.getOrThrow<string>('appUrl');
  const root = config.getOrThrow<string>('storage.root');
  return {
    default: 'private',
    disks: {
      // Product photos: public, served by the app in development
      photos: new LocalDisk({ root: `${root}/photos`, publicUrl: `${appUrl}/photos` }),
      // Invoices and uploads in progress: only reachable through signed URLs
      private: new LocalDisk({
        root: `${root}/private`,
        signedUrls: {
          baseUrl: `${appUrl}/files`,
          keys: [config.getOrThrow<string>('storage.signingKey')],
        },
      }),
    },
  };
}

```

一个 `LocalDisk` 将文件保存在一个目录中，该目录在启动时创建。`publicUrl` 是可以公开获取文件的地方：照片磁盘的 `url(key)` 返回其下的 URL。在开发环境中，应用程序本身将提供该路径（参见 [Upload product photos](/application/file-storage#upload-product-photos)）；在生产环境中，CDN 将提供。

本地目录无法像 S3 那样生成签名 URL，因此私有磁盘会自己签名：使用 `signedUrls`，其 `signedUrl()` 返回 `baseUrl` 下的 URL，使用 HMAC-SHA256 签名，应用程序验证并提供这些 URL（参见 [Serve signed URLs in development](/application/file-storage#serve-signed-urls-in-development)）。`keys` 接受一个或多个密钥。第一个进行签名，所有密钥都进行验证，因此您可以将新密钥放在首位，移除旧密钥（在其签名的链接过期后）来轮换密钥。密钥必须至少有 32 个字符。

使用 `forRootAsync()` 注册模块，以便工厂可以读取 `ConfigService`：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@nestjs/storage';
import configuration from './config/configuration.js';
import { createStorageOptions } from './storage/storage.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createStorageOptions,
    }),
  ],
})
export class AppModule {}

```

`StorageModule` 是全局的。服务可以通过以下三种方式注入一个磁盘：

| 注入方式 | 提供的 |
| --- | --- |
| `private readonly files: StorageDisk` | 默认磁盘，此处为 `private` |
| `@InjectDisk('photos') private readonly photos: StorageDisk` | 名为 `photos` 的磁盘 |
| `private readonly storage: Storage` | 所有磁盘：`storage.disk('photos')`，适用于运行时选择磁盘的代码 |

配置错误会在启动时停止应用程序。如果没有 `STORAGE_SIGNING_KEY`，`getOrThrow()` 会报告缺少密钥；如果密钥太短，错误信息会指出签名密钥必须至少有 32 个字符。对于未命名任何磁盘的 `default` 也是如此，对于注入磁盘名称但配置中未提供该名称的类也是如此：

```text
PhotosService injects the disk "photos" (@InjectDisk('photos')), but StorageModule has no disk by that name. Configured disks: private.

```

#### 上传产品照片

照片可以是最大 5 MiB 的 JPEG、PNG 或 WebP 图像。规则在下面的上传端点和更靠后的 [mobile uploads](/application/file-storage#upload-straight-to-storage-from-the-mobile-app) 中共享：

```typescript title="products/photo-rules.ts"
/** What a product photo may be, wherever it is uploaded from. */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MiB
/** Every photo gets a new key, so browsers and the CDN may cache it forever. */
export const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable';

```

上传端点使用来自 `@nestjs/platform-express` 的 `FileInterceptor()`，就像任何上传一样。区别在于 `storage` 选项：`uploadToDisk()` 是一个 multer 存储引擎，它将文件流式传输到磁盘，而不是写入内存或临时文件夹：

```typescript title="products/photos.controller.ts"
import { BadRequestException, Controller, Get, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectDisk, serveFile, StorageDisk, uploadToDisk, type StoredUpload } from '@nestjs/storage';
import type { Request, Response } from 'express';
import { MAX_PHOTO_SIZE, PHOTO_CACHE_CONTROL, PHOTO_TYPES } from './photo-rules.js';
import { PhotosService } from './photos.service.js';

@Controller()
export class PhotosController {
  constructor(
    private readonly photosService: PhotosService,
    @InjectDisk('photos') private readonly photos: StorageDisk,
  ) {}

  @Post('products/:id/photo')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: uploadToDisk({ disk: 'photos', contentTypes: PHOTO_TYPES, cacheControl: PHOTO_CACHE_CONTROL }),
      limits: { fileSize: MAX_PHOTO_SIZE, files: 1 },
    }),
  )
  upload(@Param('id') id: string, @UploadedFile() file: StoredUpload | undefined) {
    if (!file) {
      throw new BadRequestException('Attach the image as the "photo" field');
    }
    return this.photosService.replace(id, file.key);
  }

  // Development only: in production a CDN serves the photos bucket at `publicUrl`
  @Get('photos/:file')
  serve(@Param('file') file: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return serveFile(this.photos, file, { req, res, disposition: 'inline' });
  }
}

```

到处理程序运行时，照片已存储。`uploadToDisk()` 在过程中完成了三件事：

- **它检查文件是什么，而不是客户端声称是什么。** 浏览器发送它根据文件名猜测的类型，脚本可以发送任何内容，因此声明为 `image/png` 的文件很可能是 HTML 页面或包含脚本的 SVG。引擎读取流的前几个字节，根据其签名检测类型（JPEG、PNG、GIF、WebP、AVIF、HEIC 和 PDF 是内置的；[other formats](/application/file-storage#accept-csv-and-other-text-formats) 可使用自己的检测器），并在写入任何字节之前，使用 `415` 拒绝任何不在 `contentTypes` 中的内容。存储的内容类型是检测到的类型，绝不是客户端的。
- **它在不留下部分文件的情况下强制执行大小限制。** multer 在 `limits.fileSize` 处停止读取。然后引擎拒绝提交接收到的内容：请求以 `413 File too large` 失败，不存储任何内容，文件也不会被替换。
- **它选择了键。** 默认情况下，使用随机 UUID 和检测到的类型的扩展名，例如 `2f1c0d6e-….png`。唯一键很重要：一个上传永远不会覆盖另一个，缓存的照片也不会过期。

`@UploadedFile()` 返回一个 `StoredUpload`：multer 的常规字段（`fieldname`、`originalname`、`mimetype`、`size`）加上 `key`、`disk`、`contentType` 和 `etag`。`mimetype` 仍然是客户端的声明；请使用 `contentType`。

> info **提示** `ParseFilePipe` 及其验证器在拦截器之后运行，此时流式文件已存储，而 `FileTypeValidator` 需要将文件保存在内存中才能检查其字节。使用 `uploadToDisk()`，如上所述，在引擎中检查类型和大小。在 Fastify 上，从 `@nestjs/platform-fastify/multipart` 导入 `FileInterceptor` 并注册 `@fastify/multipart`；`uploadToDisk()` 在两者上都适用。

产品具有此形状，应用程序的 `ProductsService` 具有 `findOne(id)`，当 ID 未知时抛出 `NotFoundException`，以及 `setPhoto(id, key)`：

```typescript title="products/product.ts"
export interface Product {
  id: string;
  name: string;
  /** Price in cents */
  price: number;
  /** Where the photo lives on the `photos` disk */
  photoKey?: string;
}

```

服务记录新照片并删除旧照片：

```typescript title="products/photos.service.ts"
import { Injectable } from '@nestjs/common';
import { InjectDisk, StorageDisk } from '@nestjs/storage';
import { ProductsService } from './products.service.js';

@Injectable()
export class PhotosService {
  constructor(
    private readonly productsService: ProductsService,
    @InjectDisk('photos') private readonly photos: StorageDisk,
  ) {}

  async replace(productId: string, key: string): Promise<{ id: string; photoUrl: string }> {
    let previous: string | undefined;
    try {
      previous = this.productsService.findOne(productId).photoKey;
      this.productsService.setPhoto(productId, key);
    } catch (error) {
      // The upload is already stored: don't leave it behind for a product that doesn't exist
      await this.photos.delete(key);
      throw error;
    }
    if (previous) {
      await this.photos.delete(previous);
    }
    return { id: productId, photoUrl: this.photos.url(key) };
  }
}

```

拦截器在处理程序之前运行，因此即使产品不存在，文件也会被存储。在这种情况下，服务会删除它，从而防止拼写错误的 ID 留下孤立文件。`url(key)` 从磁盘的`publicUrl` 构建公共 URL。

`GET photos/:file` 路由在开发环境中提供照片。`serveFile()` 将文件从磁盘作为响应流式传输，带有`Content-Type`、`Content-Length`、`ETag`、`Last-Modified`、与文件一起存储的`Cache-Control`（如果没有则为`private`，因此共享缓存永远不会保留可能属于某个用户的文件），以及`X-Content-Type-Options: nosniff`，这样浏览器就不会怀疑类型。`disposition: 'inline'` 允许浏览器显示图像；对于可能在您的源上运行脚本的类型（如 HTML 或 SVG），`serveFile()` 无论如何都会发送`Content-Disposition: attachment`。它用`Range` 响应`206` 请求，用`If-None-Match` 响应`304` 请求，用`404` 响应文件丢失的请求。

注册功能模块，并在`AppModule` 中导入`ProductsModule`：

```typescript title="products/products.module.ts"
import { Module } from '@nestjs/common';
import { PhotosController } from './photos.controller.js';
import { PhotosService } from './photos.service.js';
import { ProductsService } from './products.service.js';

@Module({
  controllers: [PhotosController],
  providers: [ProductsService, PhotosService],
})
export class ProductsModule {}

```

##### 接受 CSV 和其他文本格式

内置检测通过文件开头的固定字节来识别格式。CSV 文件没有此类签名，因此仅凭`contentTypes: ['text/csv']` 会拒绝带有`415` 的每个 CSV 文件。对于此类格式，请传递`detectContentType`：一个接收文件开头并返回其类型的函数，或者在无法识别时返回`undefined`。

工作人员通过上传电子表格导出来更新价格。应用程序通过其标题行识别其中一个：

```typescript title="products/price-list.ts"
/** The header row of a price list exported from the spreadsheet */
const PRICE_LIST_HEADER = 'sku,price';

/** Recognizes a price list by its first line. It doesn't check the rows. */
export function detectPriceList(bytes: Buffer): string | undefined {
  // Spreadsheet apps often start a UTF-8 export with a byte order mark: TextDecoder drops it
  const text = new TextDecoder().decode(bytes);
  const header = text.split(/\r?\n/, 1)[0];
  return header === PRICE_LIST_HEADER ? 'text/csv; charset=utf-8' : undefined;
}

```

上传端点允许`text/csv` 并将该函数传递给`uploadToDisk()`。价格列表存储在私有磁盘上，因为还没有人检查其行：

```typescript title="products/price-lists.controller.ts"
@Post('products/price-lists')
@UseInterceptors(
  FileInterceptor('prices', {
    storage: uploadToDisk({
      disk: 'private',
      key: (file) => `price-lists/${randomUUID()}${file.extension}`,
      contentTypes: ['text/csv'],
      detectContentType: detectPriceList,
    }),
    limits: { fileSize: 1024 * 1024, files: 1 },
  }),
)
importPrices(@UploadedFile() file: StoredUpload | undefined) {
  if (!file) {
    throw new BadRequestException('Attach the price list as the "prices" field');
  }
  return this.priceListsService.import(file.key);
}

```

- **内置检测优先。** 只有当文件不是内置格式之一时，该函数才会运行。将 PNG 重命名为`prices.csv` 仍然被检测为 PNG 并被拒绝。将导出的`detectContentType()` 辅助函数作为选项传递不会有任何作用，因为该检查已经运行了。
- **它查看文件开头。** `bytes` 包含前 4 KiB，如果文件更小则包含整个文件。要更改此设置，请将`contentTypeSampleBytes` 设置为 1 字节到 64 KiB 的整数（需要`detectContentType`）。第二个参数具有`originalname` 和`mimetype`，但它们是客户端的声明，因此请根据字节进行决定。
- **它返回的内容会与`contentTypes` 进行比较。** 类型是比较不带参数的：列表中包含`text/csv` 允许`text/csv; charset=utf-8`。当函数返回`undefined` 或列表中不存在的类型时，在写入任何字节之前，将以`415` 拒绝上传。如果没有`contentTypes`，则接受任何返回的类型，未识别的文件将作为`application/octet-stream` 存储。
- **返回的类型是文件存储和提供时使用的类型。** 对于文本格式，包含字符集。它还设置了扩展名：`file.extension` 在上面的`key()` 中是`.csv`，默认键也以它结尾。
- **它可以是异步的。** 引擎在持有请求时会等待 promise，因此它必须快速完成。对于未识别的文件，请返回`undefined` 而不是抛出：错误会像请求中的任何其他地方一样导致上传失败，因此任何非`HttpException` 的内容将成为`500`，而不是`415`。返回任何非字符串或`undefined` 的内容也是如此。

> warning **警告** 该函数对文件开头进行分类。它不验证文件：具有正确标题的价格列表可以包含其后的任何内容。`PriceListsService.import()` 必须读取整个文件，检查每一行，并在拒绝列表时删除`file.key`，就像任何在拦截器之后运行的检查一样。

#### 保持发票私有

发票在客户首次请求时生成并存储在私有磁盘上。实际应用使用库或渲染服务渲染 PDF；此替代方案足以遵循流程：

```typescript title="invoices/render-invoice.ts"
import type { Order } from '../orders/order.interface.js';

const usd = (cents: number) => (cents / 100).toFixed(2);

/** A stand-in for a real PDF renderer (pdfkit, a headless browser, a rendering service). */
export function renderInvoice(order: Order): Buffer {
  const lines = order.items.map((item) => `% ${item.quantity} x ${item.name}  ${usd(item.price)}`);
  return Buffer.from(
    ['%PDF-1.7', `% Invoice for ${order.id}`, ...lines, `% Total ${usd(order.total)} USD`, '%%EOF', ''].join('\n'),
  );
}

```

服务使用应用程序的`OrdersService` 读取订单，其中显示了`ord_1000` 已支付的顺序和`ord_1001` 未支付的顺序，仅存储一次发票，并返回一个签名的链接：

```typescript title="invoices/invoices.service.ts"
import { ConflictException, Injectable } from '@nestjs/common';
import { StorageDisk } from '@nestjs/storage';
import { OrdersService } from '../orders/orders.service.js';
import { renderInvoice } from './render-invoice.js';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly ordersService: OrdersService,
    // No name: the default disk, `private`
    private readonly storageDisk: StorageDisk,
  ) {}

  async downloadUrl(orderId: string) {
    const order = this.ordersService.findOne(orderId);
    if (order.status === 'pending') {
      throw new ConflictException(`Order ${orderId} has not been paid yet`);
    }
    const key = `invoices/${order.id}.pdf`;
    if (!(await this.storageDisk.exists(key))) {
      await this.storageDisk.put(key, renderInvoice(order), {
        contentType: 'application/pdf',
        metadata: { orderId: order.id },
      });
    }
    const url = await this.storageDisk.signedUrl(key, {
      expiresIn: '5m',
      filename: `invoice-${order.id}.pdf`,
    });
    return { url };
  }
}

```

`put()` 接受一个`Buffer`（字符串）、一个`Uint8Array`（Node 流）、一个 Web `ReadableStream` 或任何字节的异步可迭代对象。在每个磁盘上，写入操作都是原子的：读取者看到旧文件或新文件，绝不会看到一半，并且失败的写入不会留下任何东西。`metadata` 使用您的字符串值与文件一起存储；`stat()` 和 `get()` 返回它们。

对于`LocalDisk`，文件系统写入失败会删除临时文件并保留任何现有文件。如果写入没有进展，或者持久化的大小与写入的字节不同，`put()` 将以`StorageError` 拒绝。

`signedUrl()` 返回一个在过期前无需任何其他凭据即可工作的链接。`expiresIn` 是一个持续时间：`'5m'`、`'1h'` 或毫秒，默认为 15 分钟，最长为 7 天（S3 的限制）。`filename` 设置浏览器保存文件的名称。

端点返回链接而不是文件，这允许网页或移动应用直接打开它：

```typescript title="orders/orders.controller.ts"
import { Controller, Get, Param } from '@nestjs/common';
import { InvoicesService } from '../invoices/invoices.service.js';

@Controller('orders')
export class OrdersController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get(':id/invoice')
  invoice(@Param('id') id: string) {
    return this.invoicesService.downloadUrl(id);
  }
}

```

在`OrdersModule` 中注册`OrdersController`、`OrdersService` 和 `InvoicesService`。在实际应用中，端点还会检查发票是否属于已登录的客户，例如使用来自[authorization](/security/authorization) 教程的策略。链接本身不需要检查：持有它的任何人都可以直到它过期前下载该文件。

#### 在开发环境中提供签名 URL

使用本地磁盘时，签名链接指向应用本身，`http://localhost:3000/files?key=…&expires=…&signature=…`，因此应用需要一个验证并提供该链接的路由：

```typescript title="files/files.controller.ts"
import { Controller, Get, Req, Res } from '@nestjs/common';
import { serveSignedUrl, StorageDisk } from '@nestjs/storage';
import type { Request, Response } from 'express';

/**
 * Serves the private disk's signed URLs when it is a local disk. With S3, the URLs point at
 * the bucket and this route answers 404.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storageDisk: StorageDisk) {}

  @Get()
  download(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return serveSignedUrl(this.storageDisk, { req, res });
  }
}

```

`serveSignedUrl()` 检查签名、过期时间和方法，然后像 `serveFile()` 那样响应，其中包含链接签名的文件名。签名涵盖了路由（`baseUrl`）、密钥、过期时间和文件名，因此更改其中任何一项都是一个 `403 Invalid signed URL`，过期链接是一个 `403 The signed URL has expired`，并且为某个磁盘路由签发的链接会被另一个磁盘拒绝，即使两者使用相同的签名密钥。下载管理器可以使用 `Range` 请求来恢复大文件。

在 `FilesModule` 中注册该控制器，并在 `AppModule` 中连同其他功能一起导入：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from '@nestjs/storage';
import configuration from './config/configuration.js';
import { FilesModule } from './files/files.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { ProductsModule } from './products/products.module.js';
import { createStorageOptions } from './storage/storage.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    StorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: createStorageOptions,
    }),
    ProductsModule,
    OrdersModule,
    FilesModule,
  ],
})
export class AppModule {}

```

在生产环境中，该路由保留在应用中。在那里，私有磁盘是一个 S3 磁盘，其签名 URL 指向存储桶，因此 `serveSignedUrl()` 没有内容可供提供并响应 `404`。

#### 直接从移动应用上传到存储

仓库团队使用移动应用拍摄产品照片。照片较大，手机通常连接速度较慢，因此通过 API 上传会长时间占用连接和请求。相反，应用向 API 请求一个上传 URL，将照片直接发送到存储，然后通知 API 完成：

1. `POST /products/:id/photo/uploads` 带有照片的类型和大小返回一个签名上传 URL。
2. 应用使用 `PUT` 将照片发送到该 URL。
3. `PUT /products/:id/photo` 带有上传的密钥将其设为产品的照片。

上传首先到达私有磁盘下的 `incoming/`，因为 API 尚未检查它。只有在检查后，API 才会将其复制到照片磁盘：

```typescript title="products/photos.service.ts"
@Injectable()
export class PhotosService {
  constructor(
    private readonly productsService: ProductsService,
    @InjectDisk('photos') private readonly photos: StorageDisk,
    @InjectDisk('private') private readonly uploads: StorageDisk,
  ) {}

  // ...

  async createUpload(productId: string, contentType: string, size: number) {
    this.productsService.findOne(productId);
    if (!PHOTO_TYPES.includes(contentType)) {
      throw new UnsupportedMediaTypeException(`A photo must be one of: ${PHOTO_TYPES.join(', ')}`);
    }
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PHOTO_SIZE) {
      throw new BadRequestException(`size must be between 1 and ${MAX_PHOTO_SIZE} bytes`);
    }
    // Private until checked; the product id in the key ties the upload to this product
    const key = `incoming/${productId}/${randomUUID()}`;
    const upload = await this.uploads.signedUpload(key, { contentType, contentLength: size, expiresIn: '10m' });
    return { key, ...upload };
  }

  async completeUpload(productId: string, key: string) {
    this.productsService.findOne(productId);
    // Only keys this endpoint handed out for this product: never copy an arbitrary private
    // file (an invoice) to the public photos disk.
    const prefix = `incoming/${productId}/`;
    if (typeof key !== 'string' || !key.startsWith(prefix) || !/^[0-9a-f-]{36}$/.test(key.slice(prefix.length))) {
      throw new BadRequestException('Unknown upload');
    }
    const file = await this.uploads.stat(key).catch((error: unknown) => {
      if (error instanceof StorageFileNotFoundError) {
        throw new BadRequestException('Upload the file first');
      }
      throw error;
    });
    if (file.size > MAX_PHOTO_SIZE) {
      await this.uploads.delete(key);
      throw new PayloadTooLargeException('File too large');
    }
    // The client chose the Content-Type: check what the bytes are
    const head = await this.uploads.get(key, { range: { start: 0, end: 15 } });
    const type = detectContentType(await buffer(head.body));
    if (!type || !PHOTO_TYPES.includes(type)) {
      await this.uploads.delete(key);
      throw new UnsupportedMediaTypeException(`A photo must be one of: ${PHOTO_TYPES.join(', ')}`);
    }
    // Stream it from the private disk to the public one
    const photoKey = `${randomUUID()}${EXTENSIONS[type]}`;
    const { body } = await this.uploads.get(key);
    await this.photos.put(photoKey, body, {
      contentType: type,
      contentLength: file.size,
      cacheControl: PHOTO_CACHE_CONTROL,
    });
    await this.uploads.delete(key);
    return this.replace(productId, photoKey);
  }
}

```

`signedUpload()` 返回 URL、方法（`PUT`）、客户端必须发送的头部以及 URL 的过期时间。该 URL 仅针对声明的内容类型和大小进行签名：不同的 `Content-Type` 或不同长度的请求体将被存储（`403`）拒绝，因此应用不能发送一个声明为 2 MB 照片的 2 GB 视频。

声明的类型仍然是客户端的声明。因此，`completeUpload()` 将上传视为不受信任的：

- **密钥必须是它为该产品颁发的。** 如果没有此检查，客户端可能会提交 `invoices/ord_1000.pdf`，导致 API 将某人的发票复制到公共照片磁盘。
- **会再次检查大小**，使用 `stat()`，该方法在不包含请求体的情况下返回文件的元数据。
- **会检查字节**，仅读取前 16 字节，使用范围 `get()`，并将其传递给 `detectContentType()`，后者识别 JPEG、PNG、GIF、WebP、AVIF、HEIC 和 PDF。

只有这样，照片才从一个磁盘流式传输到另一个磁盘：`get()` 以 Node 流的形式返回请求体，而 `put()` 接受它，因此文件永远不会完整地驻留在内存中。在 S3 上，这是通过 API 实例进行的下载和上传，这对照片是可接受的；对于非常大的文件，应在原地处理，例如通过一个任务。

控制器中的两个路由将请求转发：

```typescript title="products/photos.controller.ts"
// The mobile app asks for an upload URL, sends the photo there, then submits its key
@Post('products/:id/photo/uploads')
createUpload(@Param('id') id: string, @Body() body: { contentType: string; size: number }) {
  return this.photosService.createUpload(id, body.contentType, body.size);
}

@Put('products/:id/photo')
completeUpload(@Param('id') id: string, @Body('key') key: string) {
  return this.photosService.completeUpload(id, key);
}

```

使用本地磁盘时，上传 URL 再次指向应用，因此 `FilesController` 也会接收到 `PUT`。`receiveSignedUpload()` 执行与 S3 使用预签名 URL 相同的功能：它检查签名、过期时间、内容类型和长度，并将请求体流式传输到磁盘：

```typescript title="files/files.controller.ts"
import { Controller, Get, Put, Req, Res } from '@nestjs/common';
import { receiveSignedUpload, serveSignedUrl, StorageDisk } from '@nestjs/storage';
import type { Request, Response } from 'express';

/**
 * Serves the private disk's signed URLs when it is a local disk. With S3, the URLs point at
 * the bucket and this route answers 404.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly storageDisk: StorageDisk) {}

  @Get()
  download(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return serveSignedUrl(this.storageDisk, { req, res });
  }

  @Put()
  upload(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return receiveSignedUpload(this.storageDisk, { req, res });
  }
}

```

> info **提示** 在 Fastify 上，上传的请求体必须在未读取的情况下到达处理程序。Fastify 默认仅解析 JSON 和纯文本，并以 `415` 响应其他内容类型，因此请注册一个不修改请求体的捕获所有解析器：`app.getHttpAdapter().getInstance().addContentTypeParser('*', (req, payload, done) => done(null))`。

从未完成的上传将保留在 `incoming/` 下。在 S3 上，生命周期规则会在一天后删除它们（参见生产检查清单）。

#### 在生产中使用 S3 或 R2

在生产环境中，两个磁盘都成为 S3 磁盘。本地磁盘无法在那里提供服务：容器的文件系统在任务被替换时（部署、缩容、节点失败）被丢弃，连同文件一起被移除，其他实例也无法读取它们。只有工厂发生变化；每个服务、控制器和签名 URL 都能继续工作：

```typescript title="storage/storage.config.ts"
import { ConfigService } from '@nestjs/config';
import { LocalDisk, S3Disk, type StorageModuleOptions } from '@nestjs/storage';

export function createStorageOptions(config: ConfigService): StorageModuleOptions {
  if (config.get('storage.driver') === 's3') {
    const s3 = {
      endpoint: config.get<string>('storage.s3.endpoint'),
      region: config.getOrThrow<string>('storage.s3.region'),
    };
    return {
      default: 'private',
      disks: {
        photos: new S3Disk({
          ...s3,
          bucket: config.getOrThrow<string>('storage.s3.photosBucket'),
          publicUrl: config.getOrThrow<string>('storage.s3.photosUrl'),
        }),
        private: new S3Disk({
          ...s3,
          bucket: config.getOrThrow<string>('storage.s3.privateBucket'),
        }),
      },
    };
  }

  // ... the local disks from before
}

```

`S3Disk` 从标准 `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY` 和 `AWS_SESSION_TOKEN` 变量读取凭据，除非您传入 `credentials`，即一个对象或一个返回凭据的函数（在每次请求前调用，用于轮换的凭据）。没有凭据，应用不会启动。相同的类涵盖了多个服务：

| 服务 | 设置 |
| --- | --- |
| AWS S3 | `region`，例如 `eu-central-1`。无 `endpoint` |
| Cloudflare R2 | `endpoint: 'https://<account id>.r2.cloudflarestorage.com'`，`region: 'auto'` |
| MinIO | `endpoint: 'http://minio:9000'`，`forcePathStyle: true` |
| Backblaze B2 | `endpoint: 'https://s3.<region>.backblazeb2.com'`，`region` |
| Google Cloud Storage | `endpoint: 'https://storage.googleapis.com'`，使用 HMAC 密钥作为凭据，`batchDelete: false` |

使用 S3 时，`signedUrl()` 和 `signedUpload()` 返回使用凭据签名的预签名 URL，存储桶会自行验证：应用的 `/files` 路由不参与。`url()` 返回的 URL 在 `publicUrl` 下，通常是 CDN 或 R2 的公共存储桶域名，位于照片存储桶前面。

上传也流式传输到 S3。文件大小最高可达 8 MiB，在一个请求中上传；更长的文件或长度未知的流将作为分段上传上传，每次 4 个 8 MiB 的部分，如果任何部分失败则中止，因此失败的上传永远不会成为文件。网络错误、超时、节流（`429`、`SlowDown`）或 `5xx` 失败的请求会进行带退避的重试，最多尝试 3 次。`multipart`、`retry` 和 `timeout` 针对每个磁盘调整此设置。`retry` 是尝试次数，`false` 是单次尝试的设置，或者是一个对象：`attempts`、`backoff`（`delay`、`factor`、`maxDelay` 和 `jitter`，或一个返回等待时间的尝试和错误函数）以及 `retryIf(error, attempt)`，它返回 `false` 以停止重试。

> info **提示** 每个 S3 请求都使用 Signature Version 4 签名，该版本在 `node:crypto` 上实现。它会根据 AWS Signature Version 4 测试套件和 Amazon S3 API 参考中的示例进行检查，因此无需安装 AWS SDK。

#### 试用

使用包含 `kibble.png`、`scratching-post.jpg` 和 `notes.txt` 的目录启动应用，并提供一个签名密钥：

```bash
$ export STORAGE_SIGNING_KEY=$(openssl rand -hex 32)
$ npm run start

```

上传一张照片。然后尝试声明为图片的文本文件，应用在不存储的情况下会拒绝：

```bash
$ curl -F photo=@kibble.png localhost:3000/products/salmon-kibble-2kg/photo
{"id":"salmon-kibble-2kg","photoUrl":"http://localhost:3000/photos/b098be38-74b4-427a-8239-0ab3dc3a31d2.png"}

$ curl -F 'photo=@notes.txt;type=image/png' localhost:3000/products/salmon-kibble-2kg/photo
{"message":"File type not allowed. Allowed types: image/jpeg, image/png, image/webp","error":"Unsupported Media Type","statusCode":415}

```

获取照片的头部信息：

```bash
$ PHOTO=$(curl -s -F photo=@kibble.png localhost:3000/products/salmon-kibble-2kg/photo | jq -r .photoUrl)
$ curl -sI "$PHOTO" | grep -iE '^(content-|cache-control|x-content)'
X-Content-Type-Options: nosniff
Cache-Control: public, max-age=31536000, immutable
Content-Type: image/png
Content-Disposition: inline; filename="fc54756b-b451-41a8-82c9-2b979f99849a.png"
Content-Length: 70

```

获取发票的签名链接，下载它，然后尝试对另一个订单使用相同的链接：

```bash
$ curl localhost:3000/orders/ord_1000/invoice
{"url":"http://localhost:3000/files?key=invoices%2Ford_1000.pdf&expires=1790319338&disposition=attachment%3B+filename%3D%22invoice-ord_1000.pdf%22&signature=w1O_KuRThM1epUeyqpsbXNGfECkQ9605tZzNjVFMsy8"}

$ INVOICE=$(curl -s localhost:3000/orders/ord_1000/invoice | jq -r .url)
$ curl -sOJ "$INVOICE"
$ head -c 8 invoice-ord_1000.pdf
%PDF-1.7

$ curl "${INVOICE/ord_1000/ord_1001}"
{"message":"Invalid signed URL","error":"Forbidden","statusCode":403}

```

最后，以移动应用的方式上传一张照片。请求一个上传 URL，将文件发送到该 URL，然后提交其密钥：

```bash
$ curl -s localhost:3000/products/sisal-scratching-post/photo/uploads --json "{\"contentType\":\"image/jpeg\",\"size\":$(wc -c < scratching-post.jpg)}" | tee upload.json | jq
{
  "key": "incoming/sisal-scratching-post/7fe80da3-4710-4940-a904-4a1756280440",
  "url": "http://localhost:3000/files?key=incoming%2Fsisal-scratching-post%2F7fe80da3-4710-4940-a904-4a1756280440&expires=1790319638&method=PUT&type=image%2Fjpeg&length=2011&signature=vx-LwzqLUUeTQevHKTDjguRTM3c_FWOjCbik1Uo6Ojg",
  "method": "PUT",
  "headers": {
    "content-type": "image/jpeg"
  },
  "expiresAt": "2026-09-25T07:00:38.736Z"
}

$ curl -T scratching-post.jpg -H 'content-type: image/jpeg' "$(jq -r .url upload.json)"
{"key":"incoming/sisal-scratching-post/7fe80da3-4710-4940-a904-4a1756280440","size":2011,"contentType":"image/jpeg","etag":"\"7db-65c4922577c58\""}

$ curl -X PUT localhost:3000/products/sisal-scratching-post/photo --json "$(jq -c '{key}' upload.json)"
{"id":"sisal-scratching-post","photoUrl":"http://localhost:3000/photos/5329e44d-7a45-49a5-96eb-6ea0016da7eb.jpg"}

```

文件位于 `storage/photos` 和 `storage/private`，作为纯文件：`storage/private/invoices/ord_1000.pdf` 是发票。每个中的 `.nest-storage` 文件夹在写入过程中保存临时文件，以及文件名无法携带的元数据。

#### 测试

`InMemoryDisk` 将文件保留在内存中，其行为与其他磁盘相同：相同的密钥规则、范围、列表、元数据和签名 URL。与 S3 一样，它可以容纳 `a` 和 `a/b`，而本地磁盘会因为 `StorageKeyConflictError` 而拒绝。在端到端测试中，通过覆盖工厂返回的选项 `STORAGE_MODULE_OPTIONS` 来替换磁盘：

```typescript title="test/photos.e2e-spec.ts"
import type { INestApplication } from '@nestjs/common';
import { InMemoryDisk, STORAGE_MODULE_OPTIONS } from '@nestjs/storage';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('Product photos', () => {
  let app: INestApplication;
  const photos = new InMemoryDisk({ publicUrl: 'https://photos.example.com' });
  const files = new InMemoryDisk({
    signedUrls: { baseUrl: 'https://api.example.com/files', keys: ['test-signing-key-0123456789abcdef'] },
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STORAGE_MODULE_OPTIONS)
      .useValue({ default: 'private', disks: { photos, private: files } })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => photos.clear());

  it('stores the photo and returns its public URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/products/salmon-kibble-2kg/photo')
      .attach('photo', PNG, 'photo.png')
      .expect(201);

    const [key] = photos.keys();
    expect(res.body.photoUrl).toBe(`https://photos.example.com/${key}`);
    expect(await photos.getBuffer(key)).toEqual(PNG);
  });

  it('refuses a file that is not an image', async () => {
    await request(app.getHttpServer())
      .post('/products/salmon-kibble-2kg/photo')
      .attach('photo', Buffer.from('<html></html>'), 'photo.png')
      .expect(415);

    expect(photos.keys()).toEqual([]);
  });
});

```

覆盖的选项会替换工厂的结果，因此测试不需要签名密钥也不接触文件系统。`keys()` 列出磁盘包含的内容，`clear()` 清空它。上传通过 multer 和 `uploadToDisk()`，与生产环境相同；仅字节落地的位置不同。

要测试到达真实文件系统的内容，请在临时目录上使用 `LocalDisk`。对于 S3 特定的行为，例如预签名 URL 或分段上传，请将 `S3Disk` 指向本地运行的 MinIO 或其他 S3 兼容服务器。

#### 生产检查清单

- **将公共文件和私有文件保存在单独的存储桶中。** 授予照片存储桶公共读取访问权限，或者在前面放置 CDN 并将 `publicUrl` 指向 CDN。将私有存储桶保持完全私有：发票和上传只能通过签名 URL 访问。没有每文件的公共标志，因为新的 S3 存储桶禁用了对象 ACL，在一个文件上设置标志很容易出错。
- **过期废弃的上传。** 向私有存储桶添加生命周期规则，在一天后删除 `incoming/` 下的对象，以及在一天后中止不完整的 multipart 上传。
- **允许浏览器直接上传并使用 CORS。** 移动应用不需要，但向预签名 URL 发送 `PUT` 的网页需要：允许来自您站点原点的 `PUT`，并使用 `Content-Type` 头部。
- **只授予应用所需的权限。** 在两个存储桶上使用具有 `s3:GetObject`、`s3:PutObject`、`s3:DeleteObject` 和 `s3:ListBucket` 的 IAM 策略就足够了。保留 `s3:ListBucket`：没有它，S3 会对缺失的文件请求返回 `403` 而不是 `404`，并且 `exists()` 会失败而不是返回 `false`。对于短期凭证，传递一个返回它们的 `credentials` 函数。
- **静态加密。** S3 默认加密新对象；对于您自己的 KMS 密钥，请在磁盘上设置 `serverSideEncryption: 'aws:kms'` 和 `kmsKeyId`。R2 始终加密。
- **保持链接短期有效。** 对于用户立即点击的链接，五分钟足够了。签名 URL 无法撤销：它在过期前保持有效（或在 S3 上，直到签名它的凭证过期或失去访问权限），因此泄露给谁都可以使用直到那时。
- **为本地磁盘（开发和 CI）设置每环境的签名密钥**，从密钥中获取，至少 32 个字符，并通过将新密钥放在 `keys` 的开头进行轮换。
- **不要在生产环境中使用本地磁盘。** 写入容器磁盘的文件在任务被替换时会消失，其他实例无法读取它们。使用 S3、R2 或其他对象存储（参见 [Use S3 or R2 in production](/application/file-storage#use-s3-or-r2-in-production)）；本地磁盘用于开发和测试，当模块发现带有 `NODE_ENV=production` 的磁盘时，会在启动时记录警告。
- **谨慎处理所有由用户输入构建的密钥。** 密钥在每个磁盘上都会经过验证（没有 `..`，没有绝对路径，没有控制字符），因此用户输入无法逃逸磁盘，但仍可以命名磁盘上的任何文件。像上述上传端点那样，从您控制的 ID 构建密钥。

#### 参考

##### 模块选项

`StorageModule.forRoot()` 接受这些选项，而一个 `forRootAsync()` 工厂返回 `default` 和磁盘实例。磁盘类 `imports` 和 `isGlobal` 位于 `useFactory`、`useClass` 或 `useExisting` 旁边。选项作为 `STORAGE_MODULE_OPTIONS` 提供。

| 选项 | 默认值 | 描述 |
| --- | --- | --- |
| `disks` | none (必需) | 按名称的磁盘：实例，或 Nest 实例化的 `StorageDisk` 类，可进行依赖注入。参见 [Configure the disks](/application/file-storage#configure-the-disks)。 |
| `default` | 唯一的磁盘 | `StorageDisk` 和 `storage.disk()` 解析到的磁盘。当有多个磁盘时必需。 |
| `imports` | none | 磁盘类注入的模块的导出。 |
| `isGlobal` | `true` | 全局注册 `Storage`、`StorageDisk` 和命名的磁盘。 |

##### 磁盘方法

每个磁盘都有相同的方法、密钥规则和错误。每个执行 I/O 的方法都接受一个可选的 `signal`、一个 `AbortSignal`：调用会以其原因拒绝，而 `S3Disk` 会停止重试。在 `get()` 解决后中止会以原因结束 `body` 流。密钥是相对的、由最多 1024 个 UTF-8 字节分隔的 `/` 路径，不包含空、`.` 或 `..` 段、反斜杠或控制字符。

| 方法 | 描述 |
| --- | --- |
| `put(key, body, options)` | 原子地写入文件。选项：`contentType`（默认从扩展名推断）、`cacheControl`、`contentDisposition`、`metadata`（字符串值，总共 2 KB）、`contentLength`、`signal`。解析为 `key`、`size`、`contentType` 和 `etag`。 |
| `get(key, options)` | 文件的元数据及其作为 Node 流的 `body`。`range` 接受 `start` 和一个包含的 `end`，或 `suffix`。还有 `signal`。 |
| `getBuffer(key, options)`, `getText(key, options)` | 整个文件。选项：`signal`。 |
| `stat(key, options)`, `exists(key, options)` | 不含主体（body）的元数据，或文件是否存在。选项：`signal`。 |
| `delete(keys, options)` | 一个密钥或一个数组。忽略缺失的密钥。选项：`signal`；中止在密钥之间停止，保留已删除的内容。 |
| `list(options)`, `listAll(options)` | 以 UTF-8 字节顺序的 `key`、`size`、`lastModified` 和 `etag` 的一页，带有 `cursor`。选项：`prefix`、`cursor`、`limit`（最高 1000，默认值）、`signal`。`listAll()` 迭代每一页。 |
| `copy(from, to, options)`, `move(from, to, options)` | 在磁盘内，包含元数据。选项：`signal`；中止仅在任何更改之前停止。 |
| `url(key)` | 位于 `publicUrl` 下的公共 URL。如果没有则抛出错误。 |
| `signedUrl(key, options)` | 一个下载链接。选项：`expiresIn`（默认 15 分钟，最长 7 天）、`filename`、`disposition`。参见 [Keep invoices private](/application/file-storage#keep-invoices-private)。 |
| `signedUpload(key, options)` | 用于直接上传的 `url`、`method`（`PUT`）、`headers` 和 `expiresAt`。选项：`contentType`（必需）、`contentLength`、`expiresIn`。参见 [Upload straight to storage from the mobile app](/application/file-storage#upload-straight-to-storage-from-the-mobile-app)。 |

##### 磁盘

| 磁盘 | 选项 |
| --- | --- |
| `LocalDisk` | `root` (必需，在启动时创建)，`publicUrl`, `signedUrls`。用于开发和测试。`path(key)` 返回文件的绝对路径。 |
| `S3Disk` | `bucket` (必需), `region`, `endpoint`, `forcePathStyle`, `credentials`, `prefix`, `serverSideEncryption`, `kmsKeyId`, `multipart`, `retry`, `timeout`, `batchDelete`, `fetch`, `publicUrl`。参见 [Use S3 or R2 in production](/application/file-storage#use-s3-or-r2-in-production)。 |
| `InMemoryDisk` | `publicUrl`, `signedUrls`。用于测试，使用 `keys()` 和 `clear()`。参见 [Testing](/application/file-storage#测试)。 |

`signedUrls` 接收 `baseUrl`（用于服务 URL 的路由）和 `keys`（至少 32 个字符的签名密钥）。第一个密钥用于签名，所有密钥用于验证。`S3Disk` 默认值：从 `AWS_REGION` 获取 `region`，然后是 `AWS_DEFAULT_REGION`，然后是 `us-east-1`；凭证来自 `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` 和 `AWS_SESSION_TOKEN`；使用 8 MiB 的 `multipart` 和 4 的 `partSize`；使用 `retry: 3`，回退从 100 ms 开始加倍到 20 秒，带完全抖动；没有 `timeout`；`batchDelete: true`。

##### HTTP 辅助函数

| 辅助函数 | 选项 | 描述 |
| --- | --- | --- |
| `uploadToDisk(options)` | `disk` (名称或实例，默认为默认磁盘), `contentTypes`, `detectContentType`, `contentTypeSampleBytes` (默认 4 KiB，从 1 字节到 64 KiB，需要 `detectContentType`), `cacheControl`, `key`, `metadata` | `FileInterceptor()` 的存储引擎。`key` 和 `metadata` 是文件和 ⟦Request⟧ 的函数。`detectContentType(bytes, file)` 返回内置检测未识别的文件类型，或 `undefined`，并且可能返回一个 promise。参见 [Upload product photos](/application/file-storage#upload-product-photos) 和 [Accept CSV and other text formats](/application/file-storage#accept-csv-and-other-text-formats)。 |
| `serveFile(disk, key, options)` | `res` (必需), `req`, `disposition` (默认 `attachment`), `filename`, `cacheControl` | 将文件作为 ⟦Response⟧ 流式传输，当提供 `req` 时支持 `Range` 和 `If-None-Match`。 |
| `serveSignedUrl(disk, options)` | `req`, `res`, `cacheControl` | 验证并提供由应用服务的签名下载 URL。参见 [Serve signed URLs in development](/application/file-storage#serve-signed-urls-in-development)。 |
| `receiveSignedUpload(disk, options)` | `req`, `res`, `maxSize` | 验证由应用服务的签名上传 URL，并将 `PUT` 主体流式传输到磁盘。`maxSize` 限制了未带 `contentLength` 签名的上传。 |
| `detectContentType(bytes)` | none | 根据前 16 个字节的文件类型：JPEG, PNG, GIF, WebP, AVIF, HEIC 或 PDF，否则为 `undefined`。这是内置检测 `uploadToDisk()` 运行的，并且不知道 `detectContentType` 选项。 |

##### 错误

每个错误都继承自 `StorageError`。在 HTTP 辅助函数之外，它们不是 `HttpException`，因此请在您的代码中进行映射，以便它们对您的 API 有意义。

| 错误 | `status` | 发生时 |
| --- | --- | --- |
| `StorageFileNotFoundError` | 404 | 缺少键的 `get()`, `stat()`, `copy()` 或 `move()`。具有 `key`。 |
| `StorageInvalidKeyError` | 400 | 破坏键规则的键。具有 `reason`。 |
| `StorageBodyLengthError` | 400 | 主体与 `contentLength` 不匹配。具有 `expected` 和 `received`。 |
| `StorageRangeNotSatisfiableError` | 416 | 范围从文件末尾之后开始。具有 `size`。 |
| `StorageKeyConflictError` | 409 | 本地磁盘无法同时容纳 `a` 和 `a/b`。 |
| `StorageSignedUrlError` | 403 | 签名 URL 验证失败。`reason` 是 `missing`, `invalid`, `expired` 或 `method`。 |
| `StorageServiceError` | none | 对象存储拒绝或失败。具有 `code` (例如 `AccessDenied` 或 `SlowDown`), `upstreamStatus`, `requestId` 和 `operation`。 |