<!-- 此文件从 content/tutorials/mongodb-crud-api.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T00:54:23.846Z -->
<!-- 源文件: content/tutorials/mongodb-crud-api.md -->
<!-- 源哈希: 958698efc7a61cf47c6681f134f5f62a -->

### 使用 Node.js 和 MongoDB 构建 CRUD REST API

使用 NestJS 和 Mongoose 在 TypeScript 中，结合 Node.js 和 MongoDB 构建一个 CRUD REST API：输入经过验证、分页以及永不丢失的更新。

该 API 管理一个产品目录：创建产品、按页列出目录、读取单个产品、修改其部分字段以及删除它。大部分内容都很简短。本教程的重点在于通常出错的部分：格式错误的 ID 导致 500 错误、重复的 SKU 导致相同错误、查询操作符被偷偷塞入过滤器、列表在页面间重复或跳过产品，以及两个人同时编辑同一产品并互相覆盖。

到最后，该 API 将：

- 通过 [`@nestjs/mongoose`](/techniques/mongo) 在 MongoDB 中存储产品，在每个响应中使用 `id` 而不是 `_id` 和 `__v`。
- 使用 [Zod](https://zod.dev/) 模式验证每个请求体、查询字符串和路由参数，该模式还会拒绝在预期值为值的任何地方出现查询操作符，例如 `$gt`。
- 对格式错误的 ObjectId 返回 400，对未知 ObjectId 返回 404，对重复 SKU 返回 409。
- 只更新请求发送的字段，并拒绝来自陈旧副本的更新，通过版本号实现。
- 使用游标进行目录分页，按类别、价格和库存过滤，其中一个排序方式有索引。
- 当配置无效或依赖的唯一索引缺失或无法构建时，拒绝启动。
- 发送安全标头，仅接受您列出的源的浏览器请求，在 OpenAPI 文档中自我描述，响应健康检查，并在生产环境中写入 JSON 日志。
- 在针对真实 MongoDB 服务器的测试中证明并发保证。

这些是端点以及添加每个端点的部分：

| 端点 | 部分 |
| --- | --- |
| `POST /products`, `GET /products/:id`, `PATCH /products/:id`, `DELETE /products/:id` | [Build the CRUD endpoints](/tutorials/mongodb-crud-api#build-the-crud-endpoints) |
| `GET /products` | [Paginate, filter and sort the list](/tutorials/mongodb-crud-api#paginate-filter-and-sort-the-list) |
| `GET /health/live`, `GET /health/ready` | [Add health checks](/tutorials/mongodb-crud-api#add-health-checks) |
| `GET /docs` | [Assemble the application](/tutorials/mongodb-crud-api#assemble-the-application) |

> info **提示** 完成的应用在 GitHub 上是 [nestjs/example-mongodb-crud-api](https://github.com/nestjs/example-mongodb-crud-api)，包含其测试和 CI 工作流。

您需要 Node.js 22 或更高版本，以及 Docker 来本地运行 MongoDB。该 API 没有登录功能，因此 MongoDB 部分保持焦点；[What's next](/tutorials/mongodb-crud-api#whats-next) 链接到添加它的教程。

#### 创建项目

使用 [Nest CLI](/cli/overview) 创建项目。`--minimal` 生成一个代码为单文件的应用程序，本教程对其进行替换。它还安装了 [NestJS Observe SDK](/observability/sdk)、`@nestjs/observe`，并将其集成到该文件中；应用程序自己的文件保留了它：

```bash
$ npm i -g @nestjs/cli
$ nest new products-api --minimal
$ cd products-api

```

安装 [Node adapter](/techniques/performance#node-adapter)，它直接在 `node:http` 上运行 Nest，以及 Zod、[`@nestjs/config`](/application/configuration)、带有 [`@nestjs/mongoose`](/techniques/mongo) 的 Mongoose，以及用于 OpenAPI 文档和健康检查的包。 CLI 安装的 Express 适配器不再需要：

```bash
$ npm uninstall @nestjs/platform-express @types/express
$ npm i --save @nestjs/platform-node zod @nestjs/config @nestjs/mongoose mongoose @nestjs/swagger @nestjs/terminus
$ npm i --save-dev @nestjs/testing vitest vite

```

在容器中启动 MongoDB：

```bash
$ docker run -d --name catalog-db -p 27017:27017 mongo:8

```

将其 URI 添加到项目根目录中的 `.env` 文件。`ConfigModule` 在启动时加载该文件：

```bash
MONGODB_URI=mongodb://localhost:27017/catalog

```

配置是一个 Zod 模式。`ConfigModule` 在启动时根据该模式验证环境变量，当变量缺失或格式错误时，应用程序拒绝启动：

```typescript title="src/config.ts"
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  // Not z.url(): a replica set's URI lists several hosts, which isn't a valid URL.
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\/.+/, 'Expected a mongodb:// or mongodb+srv:// URI'),
  // The browser origins allowed to call the API, comma-separated. None by default.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url())),
});

export type Env = z.infer<typeof envSchema>;

```

`MONGODB_URI` 没有使用 `z.url()` 进行检查：副本集连接字符串以逗号分隔其主机，如 `mongodb://db1:27017,db2:27017/catalog` 所示，而 `z.url()` 会拒绝这种格式。

应用程序将包含以下文件：

<div class="file-tree">
  <div class="item">src</div>
  <div class="children">
    <div class="item">common</div>
    <div class="children">
      <div class="item">duplicate-key.filter.ts</div>
    </div>
    <div class="item">health</div>
    <div class="children">
      <div class="item">health.controller.ts</div>
      <div class="item">health.module.ts</div>
    </div>
    <div class="item">products</div>
    <div class="children">
      <div class="item">product.schema.ts</div>
      <div class="item">products.controller.ts</div>
      <div class="item">products.module.ts</div>
      <div class="item">products.schemas.ts</div>
      <div class="item">products.service.ts</div>
    </div>
    <div class="item">app.module.ts</div>
    <div class="item">config.ts</div>
    <div class="item">create-indexes.ts</div>
    <div class="item">main.ts</div>
  </div>
</div>

#### 使用 Mongoose 建模产品

使用 Mongoose，一个模式描述集合中的文档，一个模型读取和写入这些文档。`@nestjs/mongoose` 使用装饰器从类构建模式（参见 [Model injection](/techniques/mongo#模型注入)）：

```typescript title="src/products/product.schema.ts"
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

@Schema({
  timestamps: true, // createdAt and updatedAt, set by Mongoose on every write
  versionKey: false, // no __v: `version` below is the one clients see
  toJSON: {
    virtuals: true, // adds `id`, the ObjectId as a string
    transform: (_doc, ret: Record<string, unknown>) => {
      delete ret._id;
      return ret;
    },
  },
})
export class Product {
  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ required: true })
  category: string;

  // Money in integer cents: no floating-point rounding.
  @Prop({ required: true, min: 1 })
  price: number;

  @Prop({ required: true, min: 0 })
  stock: number;

  // Incremented by every update; a client sends back the one it read.
  @Prop({ required: true, default: 1 })
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<Product>;

export const ProductSchema = SchemaFactory.createForClass(Product);

// Two products can't share a SKU, however many requests race to create one.
ProductSchema.index({ sku: 1 }, { unique: true });
// One index per filter and sort the list allows, with _id last as the tiebreaker.
ProductSchema.index({ createdAt: -1, _id: -1 });
ProductSchema.index({ price: 1, _id: 1 });
ProductSchema.index({ category: 1, createdAt: -1, _id: -1 });
ProductSchema.index({ category: 1, price: 1, _id: 1 });

```

- **`id`，而不是 `_id`。** `toJSON` 选项添加了 `id` 虚拟属性、将 ObjectId 作为 24 个字符的字符串，并移除了 `_id`。Nest 使用 `JSON.stringify()` 序列化返回的文档，该序列化调用其 `toJSON()`，因此包含产品的每个响应都有 `id`。
- **没有 `__v`。** Mongoose 自身的版本键仅在 `save()` 中更改，并且默认仅在数组更改时更改。该 API 需要一个在每次更新时、在同一语句中更改的版本，因此它保留了自己的 `version` 字段并关闭了 `__v`。
- **价格是整数，以分为单位。** `19.99` 不能像浮点数那样精确存储；`1999` 可以。
- **索引在模式中声明。** 针对 `sku` 的唯一索引使得重复 SKU 不可能：代码中的检查做不到，因为两个请求都可能在写入之前进行检查。其他四个服务于 [list](/tutorials/mongodb-crud-api#paginate-filter-and-sort-the-list)。除非关闭其 `autoIndex` 选项，否则 Mongoose 在应用程序启动时构建它们，而生产环境需要这样做（参见 [Create indexes in production](/tutorials/mongodb-crud-api#create-indexes-in-production)）。

#### 使用 Zod 验证请求

从客户端传来的每个值在到达 Mongoose 之前都会经过一个模式。请求模式如下：

```typescript title="src/products/products.schemas.ts"
import { z } from 'zod';

// 24 hex characters: anything else would make Mongoose throw a CastError, a 500.
export const objectId = z.string().regex(/^[0-9a-f]{24}$/, 'Invalid ObjectId');

// Upper-cased, so `kb-001` and `KB-001` are the same SKU to the unique index.
const sku = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{3,32}$/, 'Expected 3 to 32 letters, digits or dashes')
  .toUpperCase();
const name = z.string().trim().min(1).max(200);
const description = z.string().max(5_000);
const category = z.string().trim().toLowerCase().min(1).max(50);
// In cents: 1999 is 19.99.
const price = z.number().int().positive().max(10_000_000);
const stock = z.number().int().min(0);

export const createProductSchema = z.object({
  sku,
  name,
  description: description.default(''),
  category,
  price,
  stock,
});
export type CreateProductDto = z.infer<typeof createProductSchema>;

// Every field optional, none nullable, plus the version the client read.
// Built from the field schemas: createProductSchema.partial() would keep
// the description's default, and clear it on every update.
export const updateProductSchema = z
  .object({ sku, name, description, category, price, stock })
  .partial()
  .extend({ version: z.number().int().positive() })
  .refine((dto) => Object.keys(dto).length > 1, 'Nothing to update');
export type UpdateProductDto = z.infer<typeof updateProductSchema>;

```

`StandardSchemaValidationPipe`，稍后全局注册，会验证声明了 `schema` 的每个参数，并将模式的输出传递给处理程序：修剪的字符串、大写的 SKU、小写的类别以及描述的默认值。每个模式推断的类型即为参数的类型，因此没有 DTO 类（参见 [Schema-based validation](/techniques/validation#基于模式的验证)）。

##### 验证 MongoDB ObjectId

当 Mongoose 构建查询时，会将路由的 id 转换为 ObjectId；如果字符串不是 ObjectId，它会抛出 `CastError`，该错误会以 500 Internal Server Error 的形式到达客户端（服务器坏了，它说），而请求当时是正常的。`objectId` 模式则在任何查询运行之前返回 400 Bad Request。一个匹配不到任何产品的有效 id 会返回 404 Not Found：请求是正常的，产品不存在。

> info **提示** `@nestjs/mongoose` 还导出了 `ParseObjectIdPipe` 和 `IsObjectIdPipe`，它们也会对无效 id 返回 400。该模式在同一机制下保留了所有参数，并在 OpenAPI 文档中记录了 id 的模式。

##### 拒绝 NoSQL 操作符注入

MongoDB 查询是对象，JSON 主体可以携带对象。如果主体的 `version` 像接收到的那样到达更新的 filter 中，客户端可以发送以下内容：

```json
{ "stock": 0, "version": { "$gte": 0 } }

```

filter 将匹配任何版本，阻止 [lost updates](/tutorials/mongodb-crud-api#prevent-lost-updates-with-a-version) 的检查将允许过时的写入通过。模式是防御手段：`version` 必须是数字，`name` 必须是字符串，因此在构建任何查询之前，如果值应该是一个对象，则会返回 400。诸如顶层 `$where` 这样的未知属性会被 `z.object()` 剥离（参见 [Unknown properties](/techniques/validation#unknown-properties)）。并且服务会从经过验证的值逐个字段构建每个 filter：它绝不会将请求主体或查询对象交给 Mongoose。

> info **提示** Mongoose 的 `sanitizeFilter` 选项是第二道防线：它会在 `$eq` 中将任何出现在 filter 中的带有 `$` 键的对象包裹起来，使其进行字面匹配。您自己的操作符随后需要用 `mongoose.trusted()` 标记。由于每个值都经过模式验证，本教程不需要此选项。

#### 构建 CRUD 端点

服务负责读取和写入，使用 `@InjectModel()` 注入的模型：

```typescript title="src/products/products.service.ts"
import { ConflictException, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Product, type ProductDocument } from './product.schema.js';
import type { CreateProductDto, UpdateProductDto } from './products.schemas.js';

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  async onModuleInit() {
    // In development and tests, the model arrives with its indexes built (waitForModelInit in AppModule).
    // With autoIndex off (production), a release step builds them: refuse to start if it didn't.
    const { toCreate } = await this.productModel.diffIndexes();
    if (toCreate.length > 0) {
      throw new Error(`Missing indexes on products: ${JSON.stringify(toCreate)}. Run npm run db:indexes.`);
    }
  }

  create(dto: CreateProductDto): Promise<ProductDocument> {
    return this.productModel.create(dto);
  }

  async findOne(id: string): Promise<ProductDocument> {
    return (await this.productModel.findById(id)) ?? notFound();
  }

  async update(id: string, { version, ...changes }: UpdateProductDto): Promise<ProductDocument> {
    // One conditional statement: it matches only while the product is still at the
    // version the client read, and $set writes only the fields the client sent.
    const product = await this.productModel.findOneAndUpdate(
      { _id: id, version },
      { $set: changes, $inc: { version: 1 } },
      { returnDocument: 'after', runValidators: true },
    );
    if (product) {
      return product;
    }
    // Nothing matched: either there's no such product, or someone changed it first.
    if (!(await this.productModel.exists({ _id: id }))) {
      notFound();
    }
    throw new ConflictException(`Product has changed since version ${version}`, { errorCode: 'VERSION_CONFLICT' });
  }

  async remove(id: string): Promise<void> {
    const { deletedCount } = await this.productModel.deleteOne({ _id: id });
    if (deletedCount === 0) {
      notFound();
    }
  }

  // list() follows in the next section.
}

function notFound(): never {
  throw new NotFoundException('Product not found');
}

```

- **`onModuleInit()` 检查索引。** `diffIndexes()` 将模式的索引与集合的索引进行比较，如果缺少任何索引，应用程序将拒绝启动。这在生产环境中很重要，因为 Mongoose 不会构建索引，而 [a release step](/tutorials/mongodb-crud-api#create-indexes-in-production) 会。在其他地方，当服务创建时，Mongoose 已经构建了索引，因为连接的 `waitForModelInit` 选项会等待构建（参见 [Assemble the application](/tutorials/mongodb-crud-api#assemble-the-application)）。
- **`findOne()` 在 `findById()` 未找到任何内容时返回 404。** id 已经过验证，所以这是“有效但未知”的情况。
- **`remove()` 检查 `deletedCount`**，来自删除的同一语句，而不是先读取产品。

##### 只更新客户端发送的字段

`update()` 发送一个包含 `findOneAndUpdate()` 的 `$set`。Zod 会排除客户端未发送的字段，因此 `$set` 只写入客户端发送的字段，没有其他字段：一个更改价格的 `PATCH` 会保持名称、描述和库存不变，即使它们在此期间发生了变化。有三件事会破坏这一点：

- **保存整个文档。** 读取产品，将其主体合并到其中，然后调用 `save()` 或 `replaceOne()` 会写回它读取的每个字段，包括其他请求自那时以来更改的字段。
- **更新模式中的默认值。** `createProductSchema.partial()` 会保留 `description` 的 `.default('')`，并且在每次未发送描述的 `PATCH` 时清除描述。
- **`$set` 中的嵌套对象。** `$set` 会替换字段的整个值：对于一个 `dimensions` 对象，仅包含其 `PATCH` 的 `width` 会移除其 `height`。使用点路径设置嵌套对象的单个属性，`'dimensions.width'`。

一个 `null` 字段会返回 400 而不是存储的 `null`，没有内容可更新的更新也是如此。`runValidators: true` 使 Mongoose 也将模式自身的规则，例如 `min: 0` 在 `stock` 上的规则，应用于更新；如果没有它，它只在 `create()` 和 `save()` 上检查它们。

##### 使用版本防止丢失更新

Ada 和 Bob 都打开了键盘的编辑表单，版本为 1。Ada 更改了价格；一分钟后，Bob 保存了他仍然拥有的副本。如果没有版本，两个请求都会成功，如果 Bob 的表单发送了所有字段，Ada 的价格就会丢失。因此，每次更新都会说明它是基于哪个版本创建的。更新的 filter 匹配产品的 `_id` 和客户端发送的 `version`，同一语句会递增 `version`。MongoDB 原子地应用 filter 和更新到文档上，因此在从版本 1 发出的两个更新中，恰好有一个能找到版本为 1 的产品。另一个不改变任何内容，服务返回 409 Conflict，告诉客户端重新读取产品并让用户决定。第二个查询将这种情况与不存在的产品（404）区分开来。409 携带一个 `errorCode`，因此客户端无需解析消息即可将其与重复的 SKU 区分开来（参见 [Machine-readable error codes](/overview/exception-filters#机器可读的错误代码)）。

这是乐观并发：用户查看表单时不会锁定任何内容。Mongoose 的 `optimisticConcurrency` 模式选项对仅 `save()` 执行相同操作，即读取文档然后写入它，需要两次往返；条件更新只需要一次。末尾的 [test](/tutorials/mongodb-crud-api#test-it) 一次发送十个相同版本的更新，并检查恰好有一个被应用。

#### 分页、过滤和排序列表

`GET /products` 返回目录的一个页面，具有默认的页面大小和上限，因此没有请求会读取整个集合。其余的请求模式如下：

```typescript title="src/products/products.schemas.ts"
// ...

// The cursor is opaque to the client, but it's client input all the same: it's
// decoded and validated like the rest of the query, before it reaches a filter.
const cursor = z
  .base64url()
  .max(200)
  .transform((value, ctx) => {
    try {
      return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid cursor' });
      return z.NEVER;
    }
  })
  // The sort value (a price, or a creation time in milliseconds) and the _id of the page's last product.
  // Bounded: 1e300 is a number, but not a date MongoDB can compare with.
  .pipe(z.tuple([z.number().int().min(0).max(8.64e15), objectId]));

// Strict: an unknown or misspelled parameter is a 400, not an unfiltered list.
export const listProductsQuerySchema = z.strictObject({
  category: category.optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  inStock: z.stringbool().optional(),
  // Only the sorts that have an index: see the schema.
  sort: z.enum(['-createdAt', 'price', '-price']).default('-createdAt'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursor.optional(),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

```

列表页面使用**游标**，而不是 `page` 和 `skip()`。`skip(n)` 在返回任何内容之前会跳过 `n` 个产品，因此深层页面会变慢，并且当有人读取第 1 页时创建的产品会使所有后续产品发生偏移，因此第 2 页会重复一个产品。游标命名页面的最后一个产品，下一页从其之后开始。客户端将每个页面的 `nextCursor` 作为 `cursor` 返回，并在达到 `null` 时停止。

- **排序是白名单。** 每个允许的排序都有其字段上的索引，并且对于过滤后的列表，有一个带有 `category` 前缀的排序，这样 MongoDB 无论页面多深都只读取一页索引条目。对任何其他字段的排序都会在返回第一个之前读取和排序所有匹配的产品。要添加排序，请先添加其索引。
- **每个排序都以 `_id` 结尾。** 许多产品具有相同的价格，如果没有平局解决者，它们的顺序是不确定的，因此一个页面可能会重复或跳过一个。`_id` 是唯一的，因此价格和 `_id` 共同构成一个全序，游标同时持有两者。
- **游标是客户端输入。** 它是 base64url-编码的 JSON，没有东西能阻止客户端发送自己的。模式会解码和验证它，因此一个包含价格所在位置的操作符对象的构造游标会返回 400。
- **查询模式是严格的。** `z.strictObject()` 会拒绝未声明的参数，因此拼写错误的 `?catgory=mice` 会返回 400 而不是未过滤的目录。Node 适配器的查询解析器将 `?category[$ne]=x` 保留为名为 `category[$ne]` 的参数，原因相同；对于构建嵌套对象的解析器，例如 `qs`，它将是一个对象，而字符串模式会拒绝它。

服务的 `list()` 将查询转换为过滤和排序：

```typescript title="src/products/products.service.ts"
import type { Model, QueryFilter } from 'mongoose';
import { Product, type ProductDocument } from './product.schema.js';
import type { CreateProductDto, ListProductsQuery, UpdateProductDto } from './products.schemas.js';

export interface ProductPage {
  items: ProductDocument[];
  /** Pass it back as `cursor` for the next page; `null` on the last one. */
  nextCursor: string | null;
}

// Each sort orders by _id last, so products with the same price keep a fixed order.
const sorts = {
  '-createdAt': { field: 'createdAt', direction: -1 },
  price: { field: 'price', direction: 1 },
  '-price': { field: 'price', direction: -1 },
} as const satisfies Record<ListProductsQuery['sort'], unknown>;

@Injectable()
export class ProductsService implements OnModuleInit {
  // ...

  async list({ category, minPrice, maxPrice, inStock, sort, limit, cursor }: ListProductsQuery): Promise<ProductPage> {
    const { field, direction } = sorts[sort];
    // Built field by field from validated values: no request object is ever spread into a filter.
    const filter: QueryFilter<Product> = {};
    if (category !== undefined) {
      filter.category = category;
    }
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = { $gte: minPrice ?? 0, $lte: maxPrice ?? Number.MAX_SAFE_INTEGER };
    }
    if (inStock !== undefined) {
      filter.stock = inStock ? { $gt: 0 } : 0;
    }
    if (cursor) {
      // The products after the cursor in sort order: a later sort value, or the same one and a later _id.
      const [lastValue, lastId] = cursor;
      const value = field === 'createdAt' ? new Date(lastValue) : lastValue;
      const after = direction === 1 ? '$gt' : '$lt';
      filter.$and = [
        { [field]: { [direction === 1 ? '$gte' : '$lte']: value } },
        { $or: [{ [field]: { [after]: value } }, { _id: { [after]: lastId } }] },
      ];
    }

    // One more than a page: if it comes back, there's a next page.
    const found = await this.productModel
      .find(filter)
      .sort({ [field]: direction, _id: direction })
      .limit(limit + 1);
    const items = found.slice(0, limit);
    const last = items.at(-1);
    const nextCursor =
      found.length > limit && last
        ? Buffer.from(JSON.stringify([+last[field], last.id])).toString('base64url')
        : null;
    return { items, nextCursor };
  }
}

```

对于 `sort=-price`，游标的条件读取“较低的价格，或者相同价格和较低的 `_id`”。价格上的外部 `$lte` 允许 MongoDB 从游标开始其索引扫描。在 `?category=mice&sort=-price&limit=5` 的后续页面上的 `explain()` 显示了 `category_1_price_1__id_1` 索引，没有 `SORT` 阶段，以及检查了 6 个文档：该页面以及告知 `list()` 有下一页的那个额外产品。

控制器将五个路由映射到服务，并在其参数上使用模式：

```typescript title="src/products/products.controller.ts"
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createProductSchema,
  listProductsQuerySchema,
  objectId,
  updateProductSchema,
  type CreateProductDto,
  type ListProductsQuery,
  type UpdateProductDto,
} from './products.schemas.js';
import { ProductsService } from './products.service.js';

const productId = { schema: objectId };

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@Query({ schema: listProductsQuerySchema }) query: ListProductsQuery) {
    return this.productsService.list(query);
  }

  @Get(':id')
  findOne(@Param('id', productId) id: string) {
    return this.productsService.findOne(id);
  }

  @Post()
  create(@Body({ schema: createProductSchema }) dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', productId) id: string, @Body({ schema: updateProductSchema }) dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', productId) id: string) {
    return this.productsService.remove(id);
  }
}

```

`POST` 默认回答 `201 Created`，而 `DELETE` 设置 `204 No Content`，因为没有内容需要返回。产品模块注册了模型、控制器和服务：

```typescript title="src/products/products.module.ts"
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './product.schema.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }])],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}

```

`MongooseModule.forFeature()` 在根模块中打开的连接上注册模型，并使用 `@InjectModel(Product.name)` 使其可注入。

#### 对重复键返回 409

当插入或更新会导致两个产品具有相同的 SKU 时，MongoDB 会返回一个 `MongoServerError`，其 `code` 是 `11000`。Nest 不知道这个错误，因此客户端收到 500，这没有提供任何可操作的信息。这是一个与现有数据的冲突，即 409，并且 [exception filter](/overview/exception-filters#继承) 可以对每个集合一次性说明这一点：

```typescript title="src/common/duplicate-key.filter.ts"
import { ConflictException, Catch, type ArgumentsHost } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { mongo } from 'mongoose';

const DUPLICATE_KEY = 11000;

/** A unique index refused the write: a 409 that names the field, rather than a 500. */
@Catch(mongo.MongoServerError)
export class DuplicateKeyFilter extends BaseExceptionFilter {
  catch(error: mongo.MongoServerError, host: ArgumentsHost) {
    if (error.code !== DUPLICATE_KEY) {
      // Any other database error is still a 500, and logged as one.
      return super.catch(error, host);
    }
    // keyValue holds the values the index refused, e.g. { sku: 'KB-001' }.
    const fields = Object.keys(error.keyValue ?? {});
    const message = `This ${fields.join(', ') || 'key'} is already taken`;
    super.catch(new ConflictException(message, { errorCode: 'DUPLICATE_KEY' }), host);
  }
}

```

- **它捕获了 Mongoose 驱动自身的副本的 `MongoServerError`**，来自 `mongoose` 的 `mongo`，因此类是 Mongoose 抛出的那个。
- **所有其他服务器错误都进入 `BaseExceptionFilter`**，如果没有该过滤器，它会返回 500 并记录它。一个对 MongoDB 的任何情况返回 409 的过滤器会隐藏真实故障。
- **消息命名字段，而不是值**，这也是 `keyValue` 所持有的：一个回显值的消息有一天可能会回显不应该回显的值。

根模块在稍后的部分使用 `APP_FILTER` 注册它。

> info **提示** 在插入之前进行检查，例如“此 SKU 是否已被占用？”，并不能替代索引。两个请求都可以在插入之前检查，并且两个插入都成功了。末尾的测试一次性发送十个具有相同 SKU 的创建请求：索引允许其中一个通过。

#### 添加健康检查

容器平台会问两个问题：进程是否存活，以及它现在是否可以提供请求。[`@nestjs/terminus`](/recipes/terminus) 回答了两者，并有一个 Mongoose 指示器，它会 ping `@nestjs/mongoose` 打开的连接（参见 [Other database indicators](/recipes/terminus#other-database-indicators)）：

```typescript title="src/health/health.controller.ts"
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, MongooseHealthIndicator } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly mongoose: MongooseHealthIndicator,
  ) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([() => this.mongoose.pingCheck('mongodb').withTimeout('1s')]);
  }
}

```

健康模块导入 Terminus，它提供了 `HealthCheckService` 和 `MongooseHealthIndicator`：

```typescript title="src/health/health.module.ts"
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}

```

存活检查不查看数据库：重启不会修复它。当 MongoDB 在一秒内没有响应 ping 时，就绪检查失败，平台会停止向该实例发送流量，直到它再次通过。

#### 组装应用程序

根模块使用配置中的 URI 打开连接，并为每个路由注册验证管道和过滤器：

```typescript title="src/app.module.ts"
import { Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { createObserveModule } from '@nestjs/observe';
import { DuplicateKeyFilter } from './common/duplicate-key.filter.js';
import { envSchema, type Env } from './config.js';
import { HealthModule } from './health/health.module.js';
import { ProductsModule } from './products/products.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // First, so it shuts down last and still sends what the other modules did.
    ObserveModule.forRoot({
      // Empty until `npx @nestjs/observe link` writes the key pair into .env: the SDK then sends nothing.
      appKey: process.env.OBSERVE_APP_KEY ?? '',
      appSecret: process.env.OBSERVE_APP_SECRET ?? '',
      serviceId: 'products-api',
    }),
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        // How long a query waits for a reachable server before it fails (the driver's default is 30s).
        serverSelectionTimeoutMS: 5_000,
        // Builds the schemas' indexes at startup. Production builds them in a release step instead.
        autoIndex: config.get('NODE_ENV', { infer: true }) !== 'production',
        // Every model waits for its collection and indexes before it's injected.
        waitForModelInit: true,
      }),
    }),
    ProductsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_PIPE, useClass: StandardSchemaValidationPipe },
    { provide: APP_FILTER, useClass: DuplicateKeyFilter },
  ],
})
export class AppModule {}

```

- **`forRootAsync()`** 从 `ConfigService` 读取 URI，在 `ConfigModule` 验证后，并在应用程序关闭时关闭连接（参见 [Async configuration](/techniques/mongo#异步配置)）。
- **`serverSelectionTimeoutMS`** 是操作等待可达 MongoDB 服务器的等待时间。使用驱动程序的默认值 30 秒，在中断期间的请求将在 500 之前挂起该时间；使用五秒，它在五秒后获得 500。
- **`autoIndex`** 仅在非生产环境中有效，在生产环境中 [a release step](/tutorials/mongodb-crud-api#create-indexes-in-production) 构建索引。
- **`waitForModelInit`** 使得每个模型等待 `model.init()`，该过程创建集合并构建索引，然后才注入。如果没有它，Mongoose 会在后台构建它们：应用程序可以在 `sku` 上的唯一索引存在之前提供请求，如果集合已经包含重复的 SKU，则构建会失败而没有日志行，并且应用程序从那时起接受重复项。有了它，构建失败会停止启动并显示 MongoDB 错误。它需要 `@nestjs/mongoose` 12.0.2 或更高版本（参见 [Wait for indexes](/techniques/mongo#wait-for-indexes)）。
- **管道和过滤器是 `AppModule` 的提供者**，而不是 `main.ts` 中的调用，因此不启动 `AppModule` 的测试也会获得它们。
- **`ObserveModule` 在 `imports` 中最先出现**，正如 [SDK's quick start](/observability/sdk#quick-start) 所做的那样：模块按逆序关闭，因此它最后停止，并发送其他模块记录的内容（参见 [Shutdown](/observability/sdk#shutdown)）。`createObserveModule()` 使用 `ObserveInstrument` 返回它，而 `main.ts` 将其传递给 Nest。
- **键值对在链接项目之前是空的。** 没有它，SDK 不发送任何内容，并在启动时说明这一点。`npx @nestjs/observe link` 将 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET` 写入 `.env`，并将 `--env-file .env` 添加到 `start` 脚本中，因此在 `AppModule` 被导入之前，SDK 读取它们时它们就在环境中（参见 [Linking from the terminal](/observability/sdk#linking-from-the-terminal)）。

`main.ts` 在 Node 适配器上创建应用程序，并添加了任何 API 边缘应有的内容。使用适配器时，应用程序选项，包括 `instrument`，是第三个参数：

```typescript title="src/main.ts"
import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import type { Env } from './config.js';

const production = process.env.NODE_ENV === 'production';
const app = await NestFactory.create<NestNodeApplication>(AppModule, new NodeAdapter(), {
  instrument: ObserveInstrument,
  // One JSON object per line in production; readable text in development.
  logger: new ConsoleLogger({ json: production }),
});
app.useSecurityHeaders();
app.enableShutdownHooks();

const config = app.get<ConfigService<Env, true>>(ConfigService);
app.enableCors({ origin: config.get('CORS_ORIGINS', { infer: true }) });

const document = new DocumentBuilder().setTitle('Products API').setVersion('1.0').build();
SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document));

await app.listen(config.get('PORT', { infer: true }));

```

- **生产环境中的 JSON 日志。** 当 `NODE_ENV` 为 `production` 时，`ConsoleLogger` 写入每行一个 JSON 对象，否则写入可读文本（参见 [JSON logging](/application/logger#json-logging)）。它在 `ConfigModule` 读取 `.env` 之前创建，因此它从进程环境读取 `NODE_ENV`，您的平台在此设置它。
- **安全标头。** `app.useSecurityHeaders()` 会在每次响应（包括错误）中发送 [Helmet](https://helmetjs.github.io/) 的标头，使用其默认值（参见 [Security headers](/security/helmet)）。
- **关闭钩子。** `enableShutdownHooks()` 使应用程序在 `SIGTERM` 时关闭，这是容器平台在每次部署时发送的：服务器停止接受连接，而 `@nestjs/mongoose` 关闭 MongoDB 连接。
- **来自配置的 CORS。** 除非 `CORS_ORIGINS` 列出，否则不允许任何浏览器源。如果没有 `origin` 调用，`enableCors()` 将对每个网站返回 `Access-Control-Allow-Origin: *`（参见 [Default allowed origins](/security/cors#default-allowed-origins)）。
- **一个 OpenAPI 文档。** [`@nestjs/swagger`](/openapi/introduction) 从控制器构建它，并从验证它们的相同 Zod 模式中获取请求体、查询参数和路由参数（参见 [Standard Schema](/openapi/introduction#standard-schema-zod-valibot)）。Swagger UI 在 `http://localhost:3000/docs`，文档在 `http://localhost:3000/docs-json`。

OpenAPI 文档中的 id 参数，来自 `objectId`：

```json
{
  "name": "id",
  "required": true,
  "in": "path",
  "schema": {
    "type": "string",
    "pattern": "^[0-9a-f]{24}$"
  }
}

```

#### 试用

启动应用程序：

```bash
$ npm run start

```

创建产品。响应包含 `id` 和 `version`，不包含 `_id` 或 `__v`：

```bash
$ curl localhost:3000/products --json '{"sku":"kb-001","name":"Mechanical keyboard","description":"Hot-swappable switches","category":"Keyboards","price":12900,"stock":5}'
{"sku":"KB-001","name":"Mechanical keyboard","description":"Hot-swappable switches","category":"keyboards","price":12900,"stock":5,"version":1,"createdAt":"2026-11-23T18:54:18.607Z","updatedAt":"2026-11-23T18:54:18.607Z","id":"6b048bda3718dc2b670713ac"}

```

小写的相同 SKU 即为相同的 SKU，唯一索引会拒绝它。作为操作者注入会发送的对象值，永远不会到达 MongoDB：

```bash
$ curl localhost:3000/products --json '{"sku":"KB-001","name":"Compact keyboard","category":"keyboards","price":8900,"stock":3}'
{"message":"This sku is already taken","error":"Conflict","statusCode":409,"errorCode":"DUPLICATE_KEY"}
$ curl localhost:3000/products --json '{"sku":"KB-002","name":{"$gt":""},"category":"keyboards","price":8900,"stock":3}'
{"message":["name: Invalid input: expected string, received object"],"error":"Bad Request","statusCode":400}

```

格式错误的 id 是客户端的错误，而格式正确但未匹配任何内容的 id 表示产品缺失：

```bash
$ curl localhost:3000/products/not-an-id
{"message":["Invalid ObjectId"],"error":"Bad Request","statusCode":400}
$ curl localhost:3000/products/507f1f77bcf86cd799439011
{"message":"Product not found","error":"Not Found","statusCode":404}

```

将价格从版本 1 更改。来自未看到第一次更改的客户端发出的第二次从相同版本 1 的更改被拒绝，操作者版本也被拒绝：

```bash
$ curl -X PATCH localhost:3000/products/6b048bda3718dc2b670713ac --json '{"price":13900,"version":1}'
{"sku":"KB-001","name":"Mechanical keyboard","description":"Hot-swappable switches","category":"keyboards","price":13900,"stock":5,"version":2,"createdAt":"2026-11-23T18:54:18.607Z","updatedAt":"2026-11-23T18:54:29.338Z","id":"6b048bda3718dc2b670713ac"}
$ curl -X PATCH localhost:3000/products/6b048bda3718dc2b670713ac --json '{"stock":4,"version":1}'
{"message":"Product has changed since version 1","error":"Conflict","statusCode":409,"errorCode":"VERSION_CONFLICT"}
$ curl -X PATCH localhost:3000/products/6b048bda3718dc2b670713ac --json '{"stock":4,"version":{"$gte":0}}'
{"message":["version: Invalid input: expected number, received object"],"error":"Bad Request","statusCode":400}

```

以相同方式添加四个鼠标，其中两个价格相同，并按价格分页，每次两个。第二页从光标之后开始，光标保存了上一个产品的价格和 `_id`。过滤器组合，而模式未声明的排序或参数将返回 400（`-g` 阻止 curl 将方括号读取为模式）：

```bash
$ curl 'localhost:3000/products?category=mice&sort=price&limit=2'
{"items":[{"sku":"MS-001","name":"Wired mouse",...,"price":1900,"stock":12,...,"id":"6b048bef3718dc2b670713ae"},{"sku":"MS-002","name":"Wireless mouse",...,"price":2900,"stock":0,...,"id":"6b048bef3718dc2b670713af"}],"nextCursor":"WzI5MDAsIjZiMDQ4YmVmMzcxOGRjMmI2NzA3MTNhZiJd"}
$ curl 'localhost:3000/products?category=mice&sort=price&limit=2&cursor=WzI5MDAsIjZiMDQ4YmVmMzcxOGRjMmI2NzA3MTNhZiJd'
{"items":[{"sku":"MS-003","name":"Vertical mouse",...,"price":2900,"stock":4,...,"id":"6b048bef3718dc2b670713b0"},{"sku":"MS-004","name":"Trackball",...,"price":4900,"stock":2,...,"id":"6b048bfc3718dc2b670713b1"}],"nextCursor":null}
$ curl 'localhost:3000/products?category=mice&inStock=true&maxPrice=3000'
{"items":[{"sku":"MS-003","name":"Vertical mouse",...,"price":2900,"stock":4,...},{"sku":"MS-001","name":"Wired mouse",...,"price":1900,"stock":12,...}],"nextCursor":null}
$ curl 'localhost:3000/products?sort=stock'
{"message":["sort: Invalid option: expected one of \"-createdAt\"|\"price\"|\"-price\""],"error":"Bad Request","statusCode":400}
$ curl -g 'localhost:3000/products?category[$ne]=mice'
{"message":["Unrecognized key: \"category[$ne]\""],"error":"Bad Request","statusCode":400}

```

删除产品。第二次删除未找到任何内容：

```bash
$ curl -i -X DELETE localhost:3000/products/6b048bda3718dc2b670713ac
HTTP/1.1 204 No Content
...
$ curl -X DELETE localhost:3000/products/6b048bda3718dc2b670713ac
{"message":"Product not found","error":"Not Found","statusCode":404}

```

当 MongoDB 停止响应时，其一秒超时内的就绪检查失败，而存活检查仍然通过：

```bash
$ curl localhost:3000/health/ready
{"status":"ok","info":{"mongodb":{"responseTime":5,"status":"up"}},"error":{},"details":{"mongodb":{"responseTime":5,"status":"up"}}}
$ docker pause catalog-db
$ curl -i localhost:3000/health/ready
HTTP/1.1 503 Service Unavailable
...
{"status":"error","info":{},"error":{"mongodb":{"message":"timeout of 1000ms exceeded","responseTime":1001,"status":"down"}},"details":{"mongodb":{"message":"timeout of 1000ms exceeded","responseTime":1001,"status":"down"}}}
$ curl localhost:3000/health/live
{"status":"ok","info":{},"error":{},"details":{}}
$ docker unpause catalog-db

```

#### 测试

这里重要的保证是关于并发的，因此测试针对真实的 MongoDB 服务器运行，并使用 `app.inject()` 发送并发请求，这是 Node 适配器提供的，因此不需要服务器监听。它们使用一个更改启动真实的 `AppModule`：将连接替换为测试文件自身数据库的连接，该数据库首先被 `createTestApp()` 清空：

```typescript title="test/test-app.ts"
import { getConnectionToken } from '@nestjs/mongoose';
import { NodeAdapter, type NestNodeApplication } from '@nestjs/platform-node';
import { Test } from '@nestjs/testing';
import { createConnection } from 'mongoose';
import { AppModule } from '../src/app.module.js';

/**
 * The real AppModule, on a database of its own: `<database in TEST_MONGODB_URI>_<name>`,
 * emptied first. Each test file passes its own name, so files run in parallel.
 */
export async function createTestApp(name: string): Promise<NestNodeApplication> {
  const server = await createConnection(process.env.TEST_MONGODB_URI!).asPromise();
  const connection = server.useDb(`${server.name}_${name}`);
  await connection.dropDatabase();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(getConnectionToken())
    .useValue(connection)
    .compile();
  const app = moduleRef.createNestApplication<NestNodeApplication>(new NodeAdapter());
  // Closing the application closes the connection too.
  return app.init();
}

```

`useDb()` 共享第一个连接的连接池，关闭应用程序即关闭两者。由于每个文件都有自己的数据库，Vitest 可以并行运行这些文件。测试配置为应用程序提供了其在启动时验证的环境；URI 从未使用：

```typescript title="vitest.config.e2e.ts"
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: {
      // Validated at startup; the tests replace the connection with their own.
      MONGODB_URI: 'mongodb://unused-in-tests',
    },
  },
});

```

第一个文件涵盖了 CRUD 路由以及它们拒绝的情况：

```typescript title="test/products.e2e-spec.ts"
import type { NestNodeApplication } from '@nestjs/platform-node';
import { createTestApp } from './test-app.js';

const url = process.env.TEST_MONGODB_URI;

describe.skipIf(!url)('Products API (e2e)', () => {
  let app: NestNodeApplication;

  beforeAll(async () => {
    app = await createTestApp('products');
  });
  afterAll(() => app.close());

  const keyboard = {
    sku: 'kb-001',
    name: 'Mechanical keyboard',
    description: 'Hot-swappable switches',
    category: 'Keyboards',
    price: 12900,
    stock: 5,
  };

  async function create(payload: object) {
    const res = await app.inject({ method: 'POST', url: '/products', payload });
    expect(res.statusCode).toBe(201);
    return res.json<{ id: string; version: number }>();
  }

  it('creates, reads, updates and deletes a product, with `id` and no `_id` or `__v`', async () => {
    const created = await create(keyboard);
    expect(created).toMatchObject({ sku: 'KB-001', category: 'keyboards', version: 1 });
    expect(created).not.toHaveProperty('_id');
    expect(created).not.toHaveProperty('__v');

    const found = await app.inject({ method: 'GET', url: `/products/${created.id}` });
    expect(found.json()).toEqual(created);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/products/${created.id}`,
      payload: { price: 13900, version: 1 },
    });
    expect(updated.statusCode).toBe(200);
    // Only the price changed: the fields the client didn't send are untouched.
    expect(updated.json()).toMatchObject({ ...created, price: 13900, version: 2, updatedAt: expect.any(String) });

    expect((await app.inject({ method: 'DELETE', url: `/products/${created.id}` })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/products/${created.id}` })).statusCode).toBe(404);
  });

  it('answers 400 for a malformed id and 404 for an unknown one', async () => {
    for (const method of ['GET', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/products/not-an-id', payload: { stock: 1, version: 1 } });
      expect(res.statusCode).toBe(400);
    }
    const unknown = await app.inject({ method: 'GET', url: '/products/507f1f77bcf86cd799439011' });
    expect(unknown.statusCode).toBe(404);
    const unknownUpdate = await app.inject({
      method: 'PATCH',
      url: '/products/507f1f77bcf86cd799439011',
      payload: { stock: 1, version: 1 },
    });
    expect(unknownUpdate.statusCode).toBe(404);
  });

  it('answers 409 for a duplicate SKU, in any letter case, on create and on update', async () => {
    await create({ ...keyboard, sku: 'MS-001', name: 'Mouse' });
    const duplicate = await app.inject({ method: 'POST', url: '/products', payload: { ...keyboard, sku: 'ms-001' } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toMatchObject({ errorCode: 'DUPLICATE_KEY' });

    const other = await create({ ...keyboard, sku: 'MS-002', name: 'Mouse 2' });
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/products/${other.id}`,
      payload: { sku: 'MS-001', version: other.version },
    });
    expect(renamed.statusCode).toBe(409);
  });

  it('refuses query operators wherever a value is expected', async () => {
    const { id } = await create({ ...keyboard, sku: 'OP-001' });
    const attempts = [
      { method: 'POST', url: '/products', payload: { ...keyboard, sku: 'OP-002', name: { $gt: '' } } },
      // A version of { $gte: 0 } would match any version, and skip the stale-write check.
      { method: 'PATCH', url: `/products/${id}`, payload: { stock: 0, version: { $gte: 0 } } },
      { method: 'GET', url: '/products?category[$ne]=keyboards' },
      { method: 'GET', url: '/products?category=a&category=b' },
      { method: 'GET', url: `/products?cursor=${encode([{ $gt: 0 }, id])}` },
      { method: 'GET', url: `/products?cursor=${encode([1e300, id])}` },
      { method: 'GET', url: '/products?sort=stock' },
    ] as const;
    for (const attempt of attempts) {
      expect((await app.inject(attempt)).statusCode).toBe(400);
    }
    const product = await app.inject({ method: 'GET', url: `/products/${id}` });
    expect(product.json()).toMatchObject({ name: 'Mechanical keyboard', stock: 5, version: 1 });
  });

  it('refuses an update with nothing to update, or with a null field', async () => {
    const { id } = await create({ ...keyboard, sku: 'NU-001' });
    for (const payload of [{ version: 1 }, { name: null, version: 1 }, { price: 19.99, version: 1 }]) {
      expect((await app.inject({ method: 'PATCH', url: `/products/${id}`, payload })).statusCode).toBe(400);
    }
  });

  it('pages through a filtered list in every sort, without repeating or skipping a product', async () => {
    // Twelve mice at four prices: ties that only the _id tiebreaker orders.
    const ids = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const { id } = await create({ sku: `PG-${i}`, name: `Mouse ${i}`, category: 'mice', price: 1000 + (i % 4) * 500, stock: i % 3 });
      ids.add(id);
    }

    type Item = { id: string; price: number; createdAt: string };
    for (const [sort, key, sign] of [['-createdAt', 'createdAt', -1], ['price', 'price', 1], ['-price', 'price', -1]] as const) {
      const seen: Item[] = [];
      let cursor: string | null = null;
      do {
        const res = await app.inject({
          method: 'GET',
          url: `/products?category=mice&sort=${sort}&limit=5${cursor ? `&cursor=${cursor}` : ''}`,
        });
        expect(res.statusCode).toBe(200);
        const page: { items: Item[]; nextCursor: string | null } = res.json();
        seen.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);

      expect(seen.map((p) => p.id).sort()).toEqual([...ids].sort());
      expect(seen.every((p) => !('_id' in p))).toBe(true);
      const values = seen.map((p) => (key === 'price' ? p.price : Date.parse(p.createdAt)));
      expect(values).toEqual([...values].sort((a, b) => sign * (a - b)));
    }

    const inStock = await app.inject({ method: 'GET', url: '/products?category=mice&inStock=true&maxPrice=1500' });
    const items = inStock.json<{ items: { price: number; stock: number }[] }>().items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((p) => p.stock > 0 && p.price <= 1500)).toBe(true);
  });
});

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

```

第二个文件发送并发写入。从相同版本发出的十次更新必须产生恰好一次变更，具有相同 SKU 的十次创建必须产生恰好一个产品：

```typescript title="test/concurrency.e2e-spec.ts"
import type { NestNodeApplication } from '@nestjs/platform-node';
import { createTestApp } from './test-app.js';

const url = process.env.TEST_MONGODB_URI;

describe.skipIf(!url)('Concurrent writes (e2e)', () => {
  let app: NestNodeApplication;

  beforeAll(async () => {
    app = await createTestApp('concurrency');
  });
  afterAll(() => app.close());

  it('applies one of ten concurrent updates of the same version, and refuses the rest', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { sku: 'RACE-1', name: 'Desk mat', category: 'desk', price: 2500, stock: 10 },
    });
    const { id } = created.json<{ id: string }>();

    // Ten clients read version 1, and each sets a stock of its own.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        app.inject({ method: 'PATCH', url: `/products/${id}`, payload: { stock: i, version: 1 } }),
      ),
    );

    const statuses = results.map((res) => res.statusCode);
    expect(statuses.sort()).toEqual([200, ...Array(9).fill(409)]);
    const winner = results.find((res) => res.statusCode === 200)!.json<{ stock: number }>();
    const product = (await app.inject({ method: 'GET', url: `/products/${id}` })).json();
    expect(product).toMatchObject({ version: 2, stock: winner.stock });
  });

  it('creates one of ten concurrent products with the same SKU', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        app.inject({
          method: 'POST',
          url: '/products',
          payload: { sku: 'race-2', name: `Lamp ${i}`, category: 'desk', price: 4900, stock: 1 },
        }),
      ),
    );
    expect(results.map((res) => res.statusCode).sort()).toEqual([201, ...Array(9).fill(409)]);
  });
});

```

向 `package.json` 添加一个脚本：

```json
"test:e2e": "vitest run --config ./vitest.config.e2e.ts"

```

将两个文件针对 MongoDB 容器运行。它们的数据库名称由 URI 命名，这里是 `catalog_test_products` 和 `catalog_test_concurrency`：

```bash
$ TEST_MONGODB_URI=mongodb://localhost:27017/catalog_test npm run test:e2e

 Test Files  2 passed (2)
      Tests  8 passed (8)

```

从 `update()` 的 `findOneAndUpdate()` 的过滤器中移除 `version`，第一个并发测试失败：所有十次更新都成功了，每次都覆盖了前一次。从光标条件中删除 `_id`（在 `list()` 中），分页测试失败：在页面边界上共享价格的产品被跳过。从 `AppModule` 移除 `waitForModelInit`，即使 Mongoose 仍在构建索引，`onModuleInit()` 也可以检查索引：应用程序拒绝启动，并且两个文件在第一次测试前都失败了。

#### 在生产环境中创建索引

构建索引会读取整个集合，并在运行时减慢所有其他请求。Mongoose 的文档建议出于此原因在生产环境中关闭 `autoIndex`，当 `NODE_ENV` 为 `production` 时，`AppModule` 会执行此操作。发布步骤会构建索引，每个发布只执行一次，在新版本启动之前：

```typescript title="src/create-indexes.ts"
import { createConnection } from 'mongoose';
import { envSchema } from './config.js';
import { Product, ProductSchema } from './products/product.schema.js';

// A release step: builds the indexes the schemas declare, before the new version starts.
const { MONGODB_URI } = envSchema.parse(process.env);
const connection = await createConnection(MONGODB_URI, { autoIndex: false }).asPromise();
try {
  // Creates the missing indexes and changes nothing else: unlike syncIndexes(), it never drops one.
  await connection.model(Product.name, ProductSchema).createIndexes();
  console.log('Indexes of products:', (await connection.collection('products').indexes()).map((index) => index.name));
} finally {
  await connection.close();
}

```

这是一个纯粹的 Mongoose 脚本，因为如果没有它创建的索引，`AppModule` 将拒绝启动。`createIndexes()` 添加缺失的索引；`syncIndexes()` 也会删除模式未声明的索引，包括出于某种原因手动添加的索引。

向 `package.json` 添加一个脚本。`--env-file-if-exists` (Node.js 22.9 或更高版本) 在开发中读取 `.env`，并且在平台设置环境时不会更改任何内容：

```json
"db:indexes": "node --env-file-if-exists=.env dist/create-indexes.js"

```

在发布步骤之前启动生产环境会拒绝运行，而不是在没有唯一索引的情况下接受重复的 SKU（堆栈跟踪被缩短）：

```bash
$ npm run build
$ NODE_ENV=production npm run start:prod
...
Error: Missing indexes on products: [{"sku":1},{"createdAt":-1,"_id":-1},{"price":1,"_id":1},{"category":1,"createdAt":-1,"_id":-1},{"category":1,"price":1,"_id":1}]. Run npm run db:indexes.

```

发布步骤之后，它启动并以 JSON 记录日志：

```bash
$ npm run db:indexes
Indexes of products: [
  '_id_',
  'sku_1',
  'createdAt_-1__id_-1',
  'price_1__id_1',
  'category_1_createdAt_-1__id_-1',
  'category_1_price_1__id_1'
]
$ NODE_ENV=production npm run start:prod
...
{"level":"log","pid":2641,"timestamp":1795460206229,"message":"Nest application successfully started","context":"NestApplication"}

```

#### 生产检查清单

- **将 `NODE_ENV` 设置为 `production`**，并将 `npm run build` 和 `npm run db:indexes` 作为发布步骤运行，在新版本启动之前。大型集合上的新索引需要一段时间来构建：在需要该索引的发布之前，将其包含在一个单独的发布中。
- **将 MongoDB 运行为副本集**，就像任何托管的 MongoDB 服务所做的那样。单个服务器是单点故障，而此 API 不需要的多文档事务需要副本集。托管服务的 `mongodb+srv://` URI 通过配置的检查。
- **仅在其数据库上创建应用程序的数据库用户，并授予 `readWrite` 角色**，将其凭证放入您平台的密钥存储中，在运行时作为 `MONGODB_URI` 注入，而不是在镜像或已提交的 `.env` 文件中。
- **将 `CORS_ORIGINS` 设置为您的 Web 应用程序的源**，包含其方案和无路径，如果没有浏览器调用 API 则留空。
- **将平台的探针指向健康检查**：存活检查在 `/health/live`，就绪检查在 `/health/ready`。如果启动时无法访问 MongoDB，`@nestjs/mongoose` 会尝试九次，每次间隔三秒，每次尝试等待 `serverSelectionTimeoutMS`，进程在启动后约 70 秒时以错误退出。
- **使用您平台的日志驱动从 stdout 收集 JSON 日志**。
- **确保所有到达过滤器的值都位于模式之后**，在每个新路由、光标和标头中：这可以防止操作者注入。
- **为生产环境提供自己的 Observe 密钥对**，来自项目的 **API Keys** 页面，作为平台环境中的 `OBSERVE_APP_KEY` 和 `OBSERVE_APP_SECRET`：`start:prod` 不加载 `.env`。然后 [NestJS Observe](/observability/overview) 记录每个请求及其每路由的延迟和失败率，以及每个请求的跟踪记录，其中包含它运行时的 MongoDB 查询，但已移除其值（参见 [Database queries and outbound HTTP](/observability/sdk#database-queries-and-outbound-http)）。一个丢失了索引的列表查询会在用户抱怨之前显示为慢路由。

#### 下一步

- 允许用户使用 JWT 访问和刷新令牌注册和登录，并为每个产品指定所有者：[Build a REST API with JWT authentication](/tutorials/rest-api-jwt-authentication) 逐步添加登录到像这样的 API。
- 决定谁可以编辑目录：[Authorization](/security/authorization)，就像 [e-commerce tutorial](/tutorials/ecommerce-backend#let-staff-manage-the-catalog) 对工作人员所做的那样。
- 限制客户端调用 API 的速度：[Rate limiting](/security/rate-limiting)。
- 使用模式而不是 `toJSON` 来塑形响应：[Schema-based serialization](/application/serialization#schema-based-serialization)。
- 在 Nest 中使用更多 Mongoose，从子文档到多个数据库：[MongoDB](/techniques/mongo)。