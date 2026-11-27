<!-- 此文件从 content/application/mail.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-27T01:04:31.906Z -->
<!-- 源文件: content/application/mail.md -->
<!-- 源哈希: 586897738312c678806f425d486b35fa -->

### 邮件

`@nestjs/mail` 从 Nest 应用程序发送电子邮件：从转义 HTML 模板渲染的邮件类，通过 SMTP 或电子邮件 API 发送，并在测试中读回。

> info **提示** 在完整应用程序的队列中发送电子邮件，并实现重试和无重复发送，请遵循 [Send emails and run background jobs in Node.js](/tutorials/background-jobs)。

当客户在网上商店为猫粮和用品下订单时，他们期望在一分钟内收到确认邮件：包含商品、总价、订单链接和 PDF 格式的发票。妥善发送这封邮件不仅仅是调用 SMTP 库：

- **HTML 必须是安全的。** 产品名称或客户名称会出现在标记中。未转义时，像 `<script>` 或一个多余的 `&` 会破坏布局，甚至更糟。
- **邮件必须能承受失败。** 邮件服务器会灰名单、速率限制和宕机。请求内部失败的发送要么导致已提交的订单失败，要么丢失邮件。
- **测试必须看到已发送的内容。** “客户收到带有订单链接的确认邮件”的测试需要渲染后的邮件及其链接，而不是模拟的方法调用。

`@nestjs/mail` 解决了这些问题。邮件类是可注入的提供者，它们从类型化数据中渲染主题和正文，因此可以注入其他提供者，例如仓储或 PDF 渲染器。正文来自 HTML 模板文件，由一个内置的、转义其插入的每个值的小型引擎渲染，或者由 Handlebars 或您插入的任何其他引擎渲染。传输器交付结果：SMTP（在 `node:net` 和 `node:tls` 中编写）以及通过其 HTTP API 的 Resend、Postmark、SendGrid 和 Amazon SES。测试将传输器替换为内存中的传输器并读取接收到的邮件。该包除了 Nest 本身外没有其他依赖。

在本教程中，您将向商店的订单 API 添加订单确认邮件：

- 开发时，将每封邮件写入 `.eml` 文件而不是发送。
- 确认邮件是一个邮件类，它渲染一个 HTML 模板，该模板在一个所有邮件共享的布局中，包含发票附件和内联徽标。
- 一个预览路由在不发送邮件的情况下在浏览器中显示邮件。
- 订单提交后，邮件通过出件箱发送，带有重试和死信队列。
- 生产环境通过 SMTP 或 Resend 发送，由环境变量决定。

#### 安装

要开始，安装所需的依赖项：

```bash
$ npm i --save @nestjs/mail

```

#### 注册邮件模块

在根模块中注册 `MailModule`，紧邻 `DrizzleModule`。邮件教程需要数据库来存储客户及其订单，以及出件箱的表，邮件通过这些表被 [sent after the order commits](/application/mail#send-after-the-order-commits)。在开发环境中，`FileMailTransport` 将每封邮件写入 `var/mail` 中的文件而不是发送，而 `FileTemplateEngine` 从 `mail/templates` 中的 HTML 文件渲染邮件正文。它导入的特性模块在以下部分构建：

```typescript title="app.module.ts"
import { Module } from '@nestjs/common';
import { DrizzleModule } from '@nestjs/drizzle';
import { FileMailTransport, FileTemplateEngine, MailModule } from '@nestjs/mail';
import { drizzle } from 'drizzle-orm/node-postgres';
import { join } from 'node:path';
import * as schema from './database/schema.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OrdersModule } from './orders/orders.module.js';

@Module({
  imports: [
    DrizzleModule.forRootAsync({
      // A pg pool on DATABASE_URL: the customers and orders, and the outbox's tables
      useFactory: () => ({ drizzle, connection: process.env.DATABASE_URL!, schema }),
    }),
    MailModule.forRoot({
      // Development: every mail becomes an .eml file in var/mail instead of leaving the machine
      transport: new FileMailTransport({ directory: 'var/mail' }),
      // Mail bodies are HTML files in mail/templates, wrapped in mail/templates/layout.html
      templates: new FileTemplateEngine({
        dir: join(import.meta.dirname, 'mail/templates'),
        layout: 'layout',
        // Development reads the files for every mail, so edits show up without a restart
        cache: process.env.NODE_ENV === 'production',
      }),
      from: 'Orders <orders@example.com>',
    }),
    OrdersModule,
    NotificationsModule,
  ],
})
export class AppModule {}

```

- `transport`：邮件如何离开应用程序。每个传输器都扩展了抽象的 `MailTransport` 类，该类也是其注入令牌，因此测试用 `overrideProvider(MailTransport)` 替换它。`FileMailTransport` 用于开发：在任何邮件客户端中打开 `.eml` 文件，即可确切看到将发送什么。它写入本地磁盘，不会发送给任何人，因此 [in production](/application/mail#send-in-production) 应用程序切换到 SMTP 或 Resend。
- `templates`：渲染命名模板的邮件。`FileTemplateEngine` 从 `dir` 读取 `.html` 文件，并将每封邮件包装在 `layout` 模板中，`mail/templates/layout.html`。相对路径 `dir` 是相对于工作目录解析的；它由 `import.meta.dirname` 构建，指向编译后的 `app.module.js` 旁边，无论应用程序从哪里启动。编译的模板都会被缓存。当 `cache` 关闭时（如此处生产环境外），每封邮件都会重新读取文件，因此编辑的模板在不重启的情况下会显示在下一封邮件中。
- `from`：默认发件人。消息可以覆盖它。

TypeScript 编译器不会将 HTML 文件复制到 `dist`。将模板添加到 `nest-cli.json` 中的 [assets](/cli/workspaces#资源)，使其位于编译后的 `app.module.js` 旁边，即 `dist/mail/templates`：

```json
{
  "compilerOptions": {
    "assets": ["mail/templates/**/*"],
    "watchAssets": true
  }
}

```

有了 `watchAssets`，每当保存时，`nest start --watch` 都会将模板复制到 `dist`。

> info **提示** 教程直接读取 `process.env` 以保持简洁。在应用程序中，通过带有验证模式的 [`@nestjs/config`](/application/configuration) 加载环境，这样缺失的 `DATABASE_URL` 或 `SMTP_URL` 会在启动时停止应用程序，并从工厂中的 `ConfigService` 读取值。

`MailModule` 是全局的，提供 `Mailer`（发送邮件）和 `MailEvents`（报告已发送和失败的内容）。缺失的 `transport` 或无效的 `from` 会在启动时停止应用程序，并附带一个指明选项的消息。

#### 编写订单确认邮件

邮件正文是一个 HTML 模板。值位于双大括号之间，而像 `#each` 这样的块会为列表中的每个项目重复其模板部分：

```html
<p>Hi {{ customer.name }},</p>
<p>thank you for your order! We are packing it now.</p>
<table>
  <tr><th>Product</th><th>Qty</th><th>Price</th></tr>
  {{#each items}}
  <tr>
    <td>{{ name }}</td>
    <td>{{ quantity }}</td>
    <td>{{ price }}</td>
  </tr>
  {{/each}}
</table>
<p><strong>Total: {{ total }}</strong></p>
<p><a href="{{ orderUrl }}">View your order</a></p>

```

每封邮件都包装在布局中。它使用三层大括号将渲染后的邮件放在 `body` 周围，并包含签名，该签名是一个位于 `mail/templates/partials/signature.html` 中的部分：

```html
<!DOCTYPE html>
<html>
<body>
{{{ body }}}
{{> signature}}
</body>
</html>

```

```html
<p>The customer care team</p>

```

一个邮件类实现了 `Mailable<TData>`。其 `render()` 方法获取数据并返回主题、模板名称及其上下文，以及模板读取的值：

```typescript title="notifications/order-confirmation.mail.ts"
import { Injectable } from '@nestjs/common';
import type { Mailable } from '@nestjs/mail';
import type { Customer } from '../customers/customers.repository.js';
import type { Order } from '../orders/order.js';

export interface OrderConfirmation {
  order: Order;
  customer: Customer;
}

const SHOP_URL = process.env.SHOP_URL ?? 'https://shop.example.com';

@Injectable()
export class OrderConfirmationMail implements Mailable<OrderConfirmation> {
  render({ order, customer }: OrderConfirmation) {
    const price = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    return {
      subject: `Your order #${order.number}`,
      // mail/templates/order-confirmation.html, wrapped in the layout
      template: 'order-confirmation',
      // The values the template shows, ready to insert: prices formatted, the link built
      context: {
        customer,
        items: order.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          price: price(item.price * item.quantity),
        })),
        total: price(order.total),
        orderUrl: `${SHOP_URL}/orders/${order.id}`,
      },
    };
  }
}

```

模板是无逻辑的。它有值、`#if`、`#unless` 和 `#each` 块、部分和注释，但没有帮助函数和表达式：需要代码的地方，例如格式化价格或构建链接，在邮件类中，使用 TypeScript 完成，在那里它是类型化和测试的。其语法是 Handlebars 的一个子集（参见 [Template syntax](/application/mail#template-syntax)），因此模板保持原样移动到 [another engine](/application/mail#use-another-template-engine)。

双大括号转义值。一个名为 `Feather wand toy <limited edition>` 的产品会变成 `Feather wand toy &lt;limited edition&gt;`，客户的名称无法注入标记。两条规则使其不易出错：

- 转义保护元素内容和带引号的属性值，因此双大括号的值只能出现在这些位置。在标签内的其他任何地方放置值都是编译错误：`href=` 后面直接跟值，或值位于属性之间。转义无法保护这两个位置（未加引号时，值中的空格将开始新属性）。请引用属性值，如上链接所示。
- 三层大括号将值原样插入，适用于您自己生成的 HTML。在本教程中，只有布局的 `body` 需要它们。

缺失的值渲染为空，类似于 Handlebars。在 `#each` 内部，`this` 是项目，`@index`、`@first` 和 `@last` 描述其位置，如果项目没有名称，则在模板的上下文中查找名称，因此一行可以显示列表外部的值。一个无法编译的模板会以永久 `MailTemplateError` 失败邮件，该邮件指明文件和位置：

```text
order-confirmation.html:5:3: {{#each items}} is never closed (expected {{/each}})

```

没有文本模板。邮件器从 HTML 中推导出纯文本部分：段落、表格行和链接作为 `View your order (https://shop.example.com/orders/…)`。不显示 HTML 的邮件客户端和垃圾邮件过滤器会读取该部分。要自己编写，请在 HTML 旁边添加 `order-confirmation.txt`：引擎将其渲染为文本部分，使用相同的语法，不进行转义。

将类注册为提供者，就像任何其他可注入的类一样：

```typescript title="notifications/notifications.module.ts"
import { Module } from '@nestjs/common';
import { OrderConfirmationMail } from './order-confirmation.mail.js';

@Module({
  providers: [OrderConfirmationMail],
})
export class NotificationsModule {}

```

然后在下单时发送它。`mailer.send()` 接收邮件类和收件人，而 `data` 的类型来自类的 `render()`：

```typescript title="orders/orders.service.ts"
async placeOrder({ customerId, items }: PlaceOrderDto): Promise<Order> {
  const customer = await this.customersRepository.findById(customerId);
  if (!customer) {
    throw new BadRequestException(`Unknown customer "${customerId}"`);
  }
  if (!items?.length) {
    throw new BadRequestException('An order needs at least one item');
  }

  const order = await this.db.transaction((tx) => this.insertOrder(tx, customerId, items));

  // After the commit: never inside the transaction, which would stay open, holding its
  // connection and locks, for as long as the mail server takes to answer
  await this.mailer.send(OrderConfirmationMail, {
    to: { name: customer.name, address: customer.email },
    data: { order, customer },
  });
  return order;
}

```

收件人是一个具有 `name` 和 `address` 的对象，因此带有逗号或引号的名称仍显示为一个显示名称。字符串也可以，如 `'Ada Lovelace <ada@example.com>'` 所示，但字符串必须包含恰好一个地址：逗号分隔的列表会抛出错误，因此用户输入的名称永远不能添加收件人。收件人列表是数组。

下单后，文件会出现在 `var/mail` 中。这有效，但它是在提交后从请求中发送邮件。[Send after the order commits](/application/mail#send-after-the-order-commits) 解释了为什么这不够好，并进行了修复。

**内联编写邮件。** 足够小可以在 TypeScript 中编写的邮件不需要模板文件。`render()` 使用 `html` 标签模板返回 `html` 代替 `template` 和 `context`：

```typescript title="notifications/order-confirmation.mail.ts"
return {
  subject: `Your order #${order.number}`,
  html: html`
    <p>Hi ${customer.name},</p>
    <p>thank you for your order! We are packing it now.</p>
    <table>
      ${order.items.map(
        (item) => html`
          <tr>
            <td>${item.name}</td>
            <td>${item.quantity}</td>
            <td>${price(item.price * item.quantity)}</td>
          </tr>`,
      )}
    </table>
    // ...
};

```

`html` 会转义您插值的每个值，遵循与模板相同的规则：标签内的值必须在带引号的属性值中，否则会抛出错误。嵌套的 `html` 模板及其数组（如表格行）会原样插入，而 `unsafeHtml()` 会插入您自己生成的 HTML；名称是警告。`mailer.send()` 也接受 `html`，用于未提供邮件类的消息。

#### 附加发票并预览邮件

发票是一个 PDF，由一个小提供者渲染。它使用内置字体手动写入 PDF，以保持示例不依赖于其他库。实际应用会在这里使用 PDF 库或渲染服务。邮件只需要字节：

```typescript title="notifications/invoice-pdf.ts"
@Injectable()
export class InvoicePdf {
  render(order: Order, customer: Customer): Buffer {
    const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const lines = [
      `Invoice ${order.number}`,
      `Date: ${order.placedAt.slice(0, 10)}`,
      `Bill to: ${customer.name}`,
      '',
      ...order.items.map((item) => `${item.quantity} x ${item.name}  ${money(item.price * item.quantity)}`),
      '',
      `Total: ${money(order.total)}`,
    ];
    // ...
  }
}

```

`render()` 会连同模板返回附件。发票是一个常规附件。徽标是一个内联图像：其 `cid` 使其成为 HTML 的一部分，HTML 以 `cid:logo@example.com` 引用它。徽标出现在每封邮件的开头，因此引用应放在布局中：

```html
<!DOCTYPE html>
<html>
<body>
<p><img src="cid:logo@example.com" alt="Logo" width="120" height="32"></p>
{{{ body }}}
{{> signature}}
</body>
</html>

```

邮件类附加了徽标和发票：

```typescript title="notifications/order-confirmation.mail.ts"
const LOGO = join(import.meta.dirname, 'assets/logo.png');

@Injectable()
export class OrderConfirmationMail implements Mailable<OrderConfirmation> {
  constructor(private readonly invoicePdf: InvoicePdf) {}

  render({ order, customer }: OrderConfirmation) {
    // ...
    return {
      subject: `Your order #${order.number}`,
      // mail/templates/order-confirmation.html, wrapped in the layout
      template: 'order-confirmation',
      // ...
      attachments: [
        // Inline: the layout's <img> references it by its cid
        { cid: 'logo@example.com', path: LOGO },
        { filename: `invoice-${order.number}.pdf`, content: this.invoicePdf.render(order, customer) },
      ],
    };
  }
}

```

在此布局中渲染的每封邮件都以相同方式附加徽标，否则其头部将显示损坏的图像。模板在链接后多了一行，即 `<p>Your invoice is attached.</p>`。

附件的内容是一个 `Buffer`、一个字符串、一个流，或者在发送邮件时从本地 `path` 读取。内容类型来自文件名，非 ASCII 文件名会被编码，以确保所有邮件客户端都能正确显示。邮件器按照邮件客户端的预期排列各个部分：徽标位于 HTML 旁边，因此显示文本版本的客户端不会将其列为附件。

> 警告 **警告** 绝不要从用户输入构建附件 `path`。该路径的文件将被附加，无论它是什么。拒绝 URL，不进行获取。

在您修改模板时，您不希望每次更改都下单。`mailer.render()` 会渲染邮件类而不发送它。一个仅供开发的路由会在浏览器中显示结果。关闭模板缓存时，在下次刷新时会显示编辑后的模板：

```typescript title="notifications/mail-preview.controller.ts"
import { Controller, Get, Header } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { OrderConfirmationMail, type OrderConfirmation } from './order-confirmation.mail.js';

const SAMPLE: OrderConfirmation = {
  customer: {
    id: 'sample',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    // ...
  },
  order: {
    id: '00000000-0000-4000-8000-000000000000',
    number: 1001,
    customerId: 'sample',
    items: [
      { productId: 'salmon-kibble-2kg', name: 'Salmon kibble, 2 kg', quantity: 2, price: 2499 },
      { productId: 'feather-wand', name: 'Feather wand toy', quantity: 1, price: 799 },
    ],
    total: 5797,
    placedAt: '2026-09-22T10:00:00.000Z',
  },
};

@Controller('dev/mail')
export class MailPreviewController {
  constructor(private readonly mailer: Mailer) {}

  /** Renders the mail with sample data, without sending it: GET /dev/mail/order-confirmation */
  @Get('order-confirmation')
  @Header('content-type', 'text/html; charset=utf-8')
  async orderConfirmation() {
    const message = await this.mailer.render(OrderConfirmationMail, { data: SAMPLE });

    // Browsers don't resolve cid: references; inline the images as data: URLs instead
    let body = message.html ?? '';
    for (const { cid, contentType, content } of message.attachments) {
      if (cid) {
        body = body.replaceAll(`cid:${cid}`, `data:${contentType};base64,${content.toString('base64')}`);
      }
    }
    return body;
  }
}

```

`render()` 返回完成的 `MailMessage`：主题、HTML 和派生文本、附件以及原始消息的 `toMime()`。此处收件人是可选的。`render()` 也接受内联编写的消息，例如主题、一个 `template` 及其 `context`，以便在没有邮件类的情况下预览模板。仅在生产环境之外注册控制器：

```typescript title="notifications/notifications.module.ts"
@Module({
  // The preview route renders mail with sample data; production doesn't need it
  controllers: process.env.NODE_ENV === 'production' ? [] : [MailPreviewController],
  providers: [OrderConfirmationMail, InvoicePdf],
})
export class NotificationsModule {}

```

#### 下单后发送

[Write the order confirmation mail](/application/mail#write-the-order-confirmation-mail) 在订单提交后从请求中发送邮件。这里有三处错误：

- **提交和发送之间的崩溃会丢失邮件。** 在错误时间重启进程的部署会导致已付费订单没有确认。
- **邮件服务器中断会导致已成功请求失败。** 订单已保存，但客户看到 500 错误并可能再次下单。
- **客户等待邮件服务器。** SMTP 交换需要几百毫秒，慢速服务器会拖慢请求时间。

这是来自 [outbox tutorial](/reliability/outbox) 的双写问题，而出件箱（`@nestjs/outbox`，在该教程中安装和设置）解决了这个问题。订单和一条 `order.placed` 消息在一个事务中提交，然后一个中继将消息交给一个处理程序发送邮件。如果发送失败，中继会带退避重试，并将永远不成功的消息移动到死信表。出件箱通过其存储（来自 `@nestjs/outbox/postgres` 的 `PostgresOutboxStore`）将消息保留在应用程序的 PostgreSQL 数据库中，与订单相邻，该数据库由 [`@nestjs/drizzle`](https://docs.nestjs.com/data/drizzle) 注册。应用程序启动时，存储会在其自己的 模式中创建其表；[Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 在出件箱教程中涵盖了这些，以及如何在生产环境中应用其迁移。

本节展示了两次订单事务：第一次是使用 Drizzle（教程的路径），然后在本节末尾的“使用 TypeORM”部分，是使用 TypeORM 作为 ORM 的应用程序的相同事务。选择其中一个。

注册 `OutboxModule`，并将存储作为根模块的提供者：一个注入 Drizzle 数据库和 `OutboxStorage` 注册表的工厂提供者，存储会向其注册。如果没有它，出件箱会将消息保留在内存中，并在重启时丢失：

```typescript title="app.module.ts"
@Module({
  imports: [
    // ...
    OutboxModule.forRootAsync({
      useFactory: () => ({
        relay: { enabled: process.env.OUTBOX_RELAY !== 'off' },
        // A mail server that is down for a while doesn't lose the confirmation
        retry: { attempts: 10, backoff: { delay: '10s', maxDelay: '10m' } },
      }),
    }),
    // ...
  ],
  providers: [
    {
      // Messages and inbox records in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromDrizzle(db) }, outboxStorage),
    },
  ],
})
export class AppModule {}

```

`OrdersService` 会添加消息而不是发送邮件，使用 Drizzle 的 `tx`，因此消息与订单一起提交或回滚：

```typescript title="orders/orders.service.ts"
async placeOrder({ customerId, items }: PlaceOrderDto): Promise<Order> {
  if (!(await this.customersRepository.findById(customerId))) {
    throw new BadRequestException(`Unknown customer "${customerId}"`);
  }
  if (!items?.length) {
    throw new BadRequestException('An order needs at least one item');
  }

  const order = await this.db.transaction(async (tx) => {
    const order = await this.insertOrder(tx, customerId, items);
    // Same transaction: the confirmation mail is queued only if the order commits
    await this.outbox.add(tx, { topic: 'order.placed', payload: order });
    return order;
  });

  this.outbox.notify(); // send now instead of at the next poll
  return order;
}

```

处理程序发送邮件：

```typescript title="notifications/order-mails.handler.ts"
import { Injectable } from '@nestjs/common';
import { MailError, Mailer } from '@nestjs/mail';
import { NonRetryableMessageError, OnOutboxMessage, type OutboxHandlerContext } from '@nestjs/outbox';
import { CustomersRepository } from '../customers/customers.repository.js';
import type { Order } from '../orders/order.js';
import { OrderConfirmationMail } from './order-confirmation.mail.js';

@Injectable()
export class OrderMailsHandler {
  constructor(
    private readonly mailer: Mailer,
    private readonly customersRepository: CustomersRepository,
  ) {}

  // Runs after the order committed. The inbox skips messages this consumer already handled.
  @OnOutboxMessage('order.placed', { consumer: 'order-confirmation-mail' })
  async sendConfirmation(order: Order, { message, signal }: OutboxHandlerContext) {
    const customer = await this.customersRepository.findById(order.customerId);
    if (!customer) {
      throw new NonRetryableMessageError(`Customer ${order.customerId} not found`);
    }

    try {
      await this.mailer.send(OrderConfirmationMail, {
        to: { name: customer.name, address: customer.email },
        data: { order, customer },
        // Over SMTP, a redelivery of this message keeps its Message-ID; Resend gets the
        // key as its Idempotency-Key and refuses the duplicate
        idempotencyKey: message.id,
        signal,
        // The outbox retries with its own backoff, and dead-letters what never succeeds
        retry: false,
      });
    } catch (error) {
      // A refused address or sender won't be accepted later: dead-letter it now
      if (error instanceof MailError && error.permanent) {
        throw new NonRetryableMessageError(error.message, { cause: error });
      }
      throw error;
    }
  }
}

```

在 `NotificationsModule` 中注册处理程序，该模块导入了用于仓储的 `CustomersModule`：

```typescript title="notifications/notifications.module.ts"
@Module({
  imports: [CustomersModule],
  // The preview route renders mail with sample data; production doesn't need it
  controllers: process.env.NODE_ENV === 'production' ? [] : [MailPreviewController],
  providers: [OrderConfirmationMail, InvoicePdf, OrderMailsHandler],
})
export class NotificationsModule {}

```

`send()` 调用中的每个选项都有其作用：

- **`idempotencyKey`。** 出件箱至少投递一次：一个在发送后、记录前崩溃的中继器会再次发送。键用于跨这些投递识别邮件。`Message-ID` 头部由它派生，因此通过 SMTP 发送的重复邮件带有相同的 id，Gmail 和其他接收者使用此 id 来丢弃它。`ResendTransport` 将键作为 Resend 的 `Idempotency-Key` 发送，Resend 会拒绝 24 小时内的重复邮件。Postmark、SendGrid 和 SES 会分配自己的 `Message-ID` 且没有幂等性键，因此使用它们时，重新投递可能会导致客户收到两次邮件。
- **`signal`。** 当处理程序比 `publishTimeout` 生命周期更长时，中继器会中止投递。邮件器会停止 SMTP 交换或 HTTP 请求。
- **`retry: false`。** 邮件器默认会重试瞬态失败三次，带有退避策略。在这里，出件箱已经以分钟而不是秒为单位重试，因此邮件器对每次投递只尝试一次。在两个层级重试会导致次数倍增。

包抛出的每个错误都继承自 `MailError`，其 `permanent` 标志指示再次发送相同消息是否可能成功。4xx SMTP 响应（灰名单、邮箱已满）、来自 HTTP 提供者的 429、超时或连接丢失是瞬态的：处理程序会重新抛出它，出件箱会重试。5xx 响应，例如 `550 5.1.1 User unknown`，是永久性的：处理程序抛出 `NonRetryableMessageError`，出件箱会立即对消息进行死信处理，而不是再尝试十次。

当 SMTP 拒绝多个收件人中的一个时，在发送消息之前就会重置事务，因此错误总是意味着没有人收到，出件箱的重试也无法投递两次。唯一的例外是：在服务器响应之前，消息已传输后连接丢失。邮件器无法知道服务器是否保留了它，报告瞬态错误，重试会再次发送，带有相同的 `Message-ID`。

**使用 TypeORM。** 针对 ORM 为 TypeORM 的应用程序的相同订单事务。Drizzle 保持教程的路径：使用此代码而不是上述 Drizzle 代码，不要放在旁边。出件箱通过与出件箱教程中 [Keep messages in your database](/reliability/outbox#keep-messages-in-your-database) 所示相同的存储在 TypeORM 的数据源中保留其消息。示例应用程序在 `src/typeorm` 中保留此版本，与教程的 Drizzle 代码相邻，其中客户、产品和订单是实体。

根模块中用 `TypeOrmModule` 替换了 `DrizzleModule`，使用了 TypeORM CLI 共享的选项，并且存储的工厂通过 `fromTypeOrm()` 注入其 `DataSource`：

```typescript title="typeorm/app.module.ts"
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      // The entities and migrations the CLI uses; migrations run on deploy (`migration:run`)
      useFactory: () => ({ ...dataSourceOptions, url: process.env.DATABASE_URL }),
    }),
    // ...
    OutboxModule.forRootAsync({
      useFactory: () => ({
        relay: { enabled: process.env.OUTBOX_RELAY !== 'off' },
        // A mail server that is down for a while doesn't lose the confirmation
        retry: { attempts: 10, backoff: { delay: '10s', maxDelay: '10m' } },
      }),
    }),
    // ...
  ],
  providers: [
    {
      // Messages and inbox records in your database, in a schema of their own (nest_outbox)
      provide: PostgresOutboxStore,
      inject: [DataSource, OutboxStorage],
      useFactory: (dataSource: DataSource, outboxStorage: OutboxStorage) =>
        new PostgresOutboxStore({ executor: fromTypeOrm(dataSource) }, outboxStorage),
    },
  ],
})
export class AppModule {}

```

`OrdersService` 使用数据源打开事务，并将事务的实体管理器传递给 `outbox.add()`，与自身的写入操作相邻。出件箱的类型参数是 TypeORM 的 `EntityManager`：

```typescript title="typeorm/orders.service.ts"
@Injectable()
export class OrdersService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customersRepository: CustomersRepository,
    private readonly outbox: Outbox<EntityManager>,
  ) {}

  async placeOrder({ customerId, items }: PlaceOrderDto): Promise<Order> {
    // ... check the customer and the items, as in the Drizzle version

    const order = await this.dataSource.transaction(async (manager) => {
      const order = await this.insertOrder(manager, customerId, items);
      // The transaction's EntityManager: the confirmation mail is queued only if the order commits
      await this.outbox.add(manager, { topic: 'order.placed', payload: order });
      return order;
    });

    this.outbox.notify(); // send now instead of at the next poll
    return order;
  }

  private async insertOrder(manager: EntityManager, customerId: string, items: PlaceOrderDto['items']): Promise<Order> {
    const found = await manager.findBy(ProductEntity, { id: In(items.map((item) => item.productId)) });
    // ... price the lines and total them, as in the Drizzle version
    // The database numbers the order from its sequence: 1001, 1002, ...
    const { generatedMaps } = await manager.insert(OrderEntity, { id, customerId, items: lines, total, placedAt });
    const { number } = generatedMaps[0] as Pick<OrderEntity, 'number'>;
    return { id, number, customerId, items: lines, total, placedAt: placedAt.toISOString() };
  }
}

```

`OrderEntity` 将 `number` 声明为身份列（`generated: 'identity'`），因此 `manager.insert()` 返回数据库分配的数字 `generatedMaps`。实体不能说明序列从哪里开始，因此示例的种子迁移将其重置为 1001，与它插入的客户和产品相邻。处理程序和 `NotificationsModule` 保持不变；`CustomersRepository` 像应用程序的其余部分一样使用 TypeORM 读取客户。

#### 在生产环境中发送

开发时写入文件到本地磁盘，容器替换时会丢失；生产环境需要真实的传输器。从环境变量中选择它，这样相同的构建可以在任何地方运行：

```typescript title="mail-transport.ts"
import { FileMailTransport, ResendTransport, SmtpTransport, type MailTransport } from '@nestjs/mail';
import { readFileSync } from 'node:fs';

/**
 * The transport for this environment: `file` in development (the default), `smtp` or
 * `resend` in production. Missing settings fail at startup, naming the variable.
 */
export function mailTransport(env: NodeJS.ProcessEnv = process.env): MailTransport {
  switch (env.MAIL_TRANSPORT ?? 'file') {
    case 'file':
      return new FileMailTransport({ directory: env.MAIL_DIRECTORY ?? 'var/mail' });
    case 'smtp':
      return new SmtpTransport({
        url: required(env, 'SMTP_URL'), // smtp://user:password@smtp.example.com:587
        pool: true,
        // A private CA, e.g. for a relay inside the company network
        ...(env.SMTP_CA_FILE && { tls: { ca: readFileSync(env.SMTP_CA_FILE) } }),
      });
    case 'resend':
      return new ResendTransport({ apiKey: required(env, 'RESEND_API_KEY') });
    default:
      throw new Error(`MAIL_TRANSPORT must be "file", "smtp" or "resend" (got "${env.MAIL_TRANSPORT}")`);
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) {
    throw new Error(`${name} is required when MAIL_TRANSPORT is "${env.MAIL_TRANSPORT}"`);
  }
  return value;
}

```

在 `forRootAsync()` 中构建传输器。工厂在启动时运行，因此 `MAIL_TRANSPORT` 中的拼写错误或缺少 `SMTP_URL` 会在应用程序启动时停止，而不是在第一次邮件发送时失败：

```typescript title="app.module.ts"
MailModule.forRootAsync({
  // Runs at startup: a bad MAIL_TRANSPORT or a missing SMTP_URL stops the app there
  useFactory: () => ({
    transport: mailTransport(),
    templates: new FileTemplateEngine({
      dir: join(import.meta.dirname, 'mail/templates'),
      layout: 'layout',
      cache: process.env.NODE_ENV === 'production',
    }),
    from: process.env.MAIL_FROM ?? 'Orders <orders@example.com>',
  }),
}),

```

**SMTP。** `SmtpTransport` 本身使用 SMTP，在 `node:net` 和 `node:tls` 上：

- **加密。** 在 587 端口上使用 STARTTLS 升级，如果服务器不提供 STARTTLS，则会被拒绝而不是以明文发送。`startTls: 'opportunistic'`（localhost 的默认设置）仅在服务器提供时升级，而 `'never'` 保持明文，适用于受信任网络的中继器。在 465 端口（`smtps://`）上，它从第一个字节开始使用 TLS。证书会针对主机名进行验证；`tls.ca` 添加了私有 CA。凭据绝不会通过未加密连接发送，除了到 localhost。
- **认证。** 它使用服务器提供的 AUTH PLAIN 或 LOGIN，而 `authMethod` 强制使用其中一个。对于 Gmail 和 Microsoft 365，请将 OAuth 访问令牌作为 `accessToken` 在 `auth` 中传递给 XOAUTH2。OAuth 访问令牌会过期，通常在一小时后，因此 `accessToken` 也可以是一个返回令牌的函数或一个返回令牌的 promise：它对每个新连接调用，可以获取新令牌。`name` 设置传输器自我介绍时使用的名称在 `EHLO` 中；默认是完全限定的机器主机名，否则是其 IP 地址。
- **连接池。** `pool: true` 会保持最多五个连接打开并重用它们，而不是每次邮件都进行 TCP 和 TLS 握手。一个对象设置了限制：`maxConnections`（默认 5；后续发送等待空闲连接），`maxMessages`（默认 100，之后连接被替换）和 `idleTimeout`（默认 `'30s'`，之后空闲连接被关闭）。每个连接在应用程序关闭时会发送 `QUIT`。
- **回复。** 4xx 响应是瞬态的 `MailSmtpError`，5xx 响应是永久性的。两者都携带回复 `code`、增强代码（如 `5.1.1`）和服务器文本。

当 SMTP 服务器不支持 DKIM 签名邮件时，添加 `dkim`，并提供域名（`domainName`）、选择器（`keySelector`）和私钥（`privateKey`，PEM 或 `KeyObject`）。RSA 密钥使用 `rsa-sha256` 签名，Ed25519 密钥使用 `ed25519-sha256`（RFC 8463）；并非所有接收者都验证 Ed25519 签名，且传输器使用一个密钥签名，因此除非您知道接收方的服务器支持，否则 RSA 是安全的选择。签名涵盖 From、Reply-To、To、Cc、Subject、Date、Message-ID 和 MIME 头部，以及消息的自定义头部；`dkim.headers` 替换了该列表。From 始终被签名，并且比消息中出现的次数多一次，因此在签名下方添加第二个 From 会破坏签名。HTTP 提供者会使用其验证的域名自行签名。

**HTTP 提供者。** `ResendTransport`、`PostmarkTransport`、`SendGridTransport` 和 `SesTransport` 使用 `fetch` 调用提供者的 API，无需 SDK。`fetch` 选项替换全局选项，用于通过代理或在测试中模拟 API。`SesTransport` 使用 AWS Signature Version 4 签名其请求，并将 AWS SDK 的凭证提供者（如实例角色）作为 `credentials` 接受。在四者中，只有 Resend 支持幂等性键。Resend 和 SendGrid 需要至少一个 `to` 收件人：仅包含 `cc` 或 `bcc` 的邮件在请求前会以 `MailMessageError` 失败。

**国际化地址。** 包含非 ASCII 字符的域名（`zoë@kočka.example`）会为每个传输器转换为其 ASCII 形式（IDNA，`xn--...`），因此无需服务器支持。在 `@` 之前，非 ASCII 的本地部分无法转换：通过 SMTP 需要服务器的 SMTPUTF8 扩展。`SmtpTransport` 在服务器提供时使用 SMTPUTF8，否则在发送任何内容之前会以永久的 `MailConnectionError` 失败：`The SMTP server ... doesn't support SMTPUTF8, which an address with non-ASCII characters needs`。HTTP 提供者按原样获取地址，是否接受取决于提供者。

在 `main.ts` 中使用 `app.enableShutdownHooks()`，这样部署就可以让中继器完成正在发送的邮件，然后在之后关闭 SMTP 连接池。

#### 使用客户的语言发送

商店以英语和波兰语销售。客户在注册时选择一种语言，`customers` 表将其存储在 `locale` 列中：`en` 或 `pl`。邮件发送器将每次发送的区域设置传递给模板引擎，模板引擎据此选择相应的模板。

翻译模板：在英语模板旁边添加 `order-confirmation.pl.html`。

```html
<p>Cześć {{ customer.name }},</p>
<p>dziękujemy za zamówienie! Właśnie je pakujemy.</p>
<table>
  <tr><th>Produkt</th><th>Ilość</th><th>Cena</th></tr>
  {{#each items}}
  <tr>
    <td>{{ name }}</td>
    <td>{{ quantity }}</td>
    <td>{{ price }}</td>
  </tr>
  {{/each}}
</table>
<p><strong>Razem: {{ total }}</strong></p>
<p><a href="{{ orderUrl }}">Zobacz zamówienie</a></p>
<p>Fakturę znajdziesz w załączniku.</p>

```

对于区域设置 `pl`，`FileTemplateEngine` 渲染 `order-confirmation.pl.html`，对于任何其他区域设置或无区域设置，则为 `order-confirmation.html`。区域设置会首先尝试自身，然后尝试其语言：对于 `pt-BR`，引擎首先查找 `order-confirmation.pt-BR.html`，然后查找 `order-confirmation.pt.html`。部分和布局以相同方式查找，因此布局保持共享，波兰语签名是其自身的局部：

```html
<p>Zespół obsługi klienta</p>

```

邮件的副本是散文，因此是逐文件翻译的：翻译人员看到整个邮件，而不是逐个填充键来编写波兰语句子。邮件类计算的内容仍然取决于区域设置：主题、发票的文件名和价格。它们来自 `@nestjs/i18n`，[internationalization chapter](/application/i18n) 深入介绍了这一点。为邮件添加一个目录，每种语言一个：

```json
{
  "orderConfirmation": {
    "subject": "Your order #{number}",
    "invoiceFile": "invoice-{number}.pdf"
  }
}

```

```json
{
  "orderConfirmation": {
    "subject": "Twoje zamówienie #{number}",
    "invoiceFile": "faktura-{number}.pdf"
  }
}

```

注册目录的形状，以便在编译时检查键，并在 `MailModule` 旁边注册 `I18nModule`：

```typescript title="i18n/translations.ts"
import type mail from './en/mail.json';

export interface Translations {
  mail: typeof mail;
}

declare module '@nestjs/i18n' {
  interface I18nTypes {
    translations: Translations;
  }
}

```

```typescript title="app.module.ts"
@Module({
  imports: [
    // ...
    I18nModule.forRoot({
      defaultLocale: 'en',
      supportedLocales: ['en', 'pl'],
      loader: new JsonI18nLoader({ path: join(import.meta.dirname, 'i18n') }),
    }),
    MailModule.forRootAsync({
      // ...
    }),
    // ...
  ],
})
export class AppModule {}

```

在 `nest-cli.json` 的资产中也添加这些目录（`i18n/**/*.json`），如国际化章节所示。

邮件类是一个提供者，因此它将 `I18nService` 注入到发票渲染器旁边。`render()` 接收第二个参数，即渲染上下文，其 `locale` 是传递给 `send()` 的，也是邮件发送器传递给模板引擎的。其 `to` 包含解析后的收件人，如果没有收件人则为空（预览渲染时）：

```typescript title="notifications/order-confirmation.mail.ts"
type Key = keyof Translations['mail']['orderConfirmation'];

const SHOP_URL = process.env.SHOP_URL ?? 'https://shop.example.com';
const LOGO = join(import.meta.dirname, 'assets/logo.png');

@Injectable()
export class OrderConfirmationMail implements Mailable<OrderConfirmation> {
  constructor(
    private readonly i18nService: I18nService,
    private readonly invoicePdf: InvoicePdf,
  ) {}

  render({ order, customer }: OrderConfirmation, { locale }: MailRenderContext) {
    // Mail is sent outside the customer's request, so the locale is always passed explicitly
    const t = (key: Key, args?: Record<string, unknown>) =>
      this.i18nService.t(`mail.orderConfirmation.${key}`, { locale, args });
    const price = (cents: number) =>
      this.i18nService.formatNumber(cents / 100, { locale, style: 'currency', currency: 'USD' });
    return {
      subject: t('subject', { number: order.number }),
      // order-confirmation.pl.html for Polish, else order-confirmation.html
      template: 'order-confirmation',
      // ...
      attachments: [
        // Inline: the layout's <img> references it by its cid
        { cid: 'logo@example.com', path: LOGO },
        { filename: t('invoiceFile', { number: order.number }), content: this.invoicePdf.render(order, customer) },
      ],
    };
  }
}

```

上下文不改变：相同的值填充任一模板。`Key` 是 `keyof Translations['mail']['orderConfirmation']`，因此拼写错误的键会导致编译错误。价格会根据区域设置格式化：英语中为 `$25.98`，波兰语中为 `25,98 USD`。发票的文件名来自目录：`invoice-1001.pdf` 或 `faktura-1001.pdf`。

> 警告 **警告** 明确传递区域设置。`I18nService` 会回退到当前请求的区域设置，而邮件通常在收件人请求之外发送：例如来自出库处理程序，如本例所示，或来自其他人（如管理员）发起的请求。该请求的区域设置是错误的。

出库处理程序在发送时传递客户的区域设置：

```typescript title="notifications/order-mails.handler.ts"
await this.mailer.send(OrderConfirmationMail, {
  to: { name: customer.name, address: customer.email },
  data: { order, customer },
  locale: customer.locale,
  // ...
});

```

波兰语的主题或收件人名称不能原样放入邮件头中：头部是 ASCII 编码的。邮件发送器将非 ASCII 头部文本编码为 RFC 2047 编码词，例如 `=?UTF-8?Q?Twoje_zam=C3=B3wienie_=231001?=`，并将正文编码为 quoted-printable，因此每个服务器都携带未更改的消息，邮件客户端显示 `Twoje zamówienie #1001`。

预览从查询字符串获取语言，因此可以在浏览器中检查两个版本：

```typescript title="notifications/mail-preview.controller.ts"
/** Renders the mail with sample data, without sending it: GET /dev/mail/order-confirmation?locale=pl */
@Get('order-confirmation')
@Header('content-type', 'text/html; charset=utf-8')
async orderConfirmation(@Query('locale') locale = 'en') {
  const message = await this.mailer.render(OrderConfirmationMail, { data: SAMPLE, locale });
  // ...
}

```

#### 使用另一个模板引擎

`FileTemplateEngine` 实现了 `MailTemplateEngine`，这是一个抽象类，有一个方法：`render()` 接收模板名称、上下文和区域设置，并返回 HTML，或包含 `html` 和 `text` 的对象，或两者之一的 promise。将其扩展以使用 Handlebars、EJS 或任何其他引擎进行渲染。在 `.hbs` 文件中用于 Handlebars 模板的引擎：

```typescript title="mail/handlebars-template.engine.ts"
import { MailTemplateEngine, MailTemplateError, type MailTemplateRenderOptions } from '@nestjs/mail';
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEMPLATES = join(import.meta.dirname, 'templates');

/** Renders order-confirmation.pl.hbs, else order-confirmation.hbs, with Handlebars. */
export class HandlebarsTemplateEngine extends MailTemplateEngine {
  private readonly templates = new Map<string, ReturnType<typeof Handlebars.compile> | undefined>();

  async render(name: string, context: object, { locale }: MailTemplateRenderOptions) {
    // Only a language code goes into a file name, never whatever the locale holds
    const localized = locale && /^[a-z]{2}$/.test(locale) ? [`${name}.${locale}.hbs`] : [];
    for (const file of [...localized, `${name}.hbs`]) {
      const template = await this.load(file);
      if (template) {
        return template(context);
      }
    }
    throw new MailTemplateError(`No template "${name}" in ${TEMPLATES}`, { template: name });
  }

  private async load(file: string) {
    if (!this.templates.has(file)) {
      const source = await readFile(join(TEMPLATES, file), 'utf8').catch(() => undefined);
      // compat: plain paths fall back to outer contexts, as in FileTemplateEngine
      this.templates.set(file, source === undefined ? undefined : Handlebars.compile(source, { compat: true }));
    }
    return this.templates.get(file);
  }
}

```

将其作为 `templates` 传入，替换 `FileTemplateEngine`：一个实例或类，Nest 会实例化它，以便它可以注入配置或其他提供者。与传输器一样，一个类位于 `forRootAsync()` 的顶层，在 `useFactory` 旁边，并且工厂返回实例。

邮件发送器按引擎返回的 HTML 发送，因此转义是引擎的工作：Handlebars 会转义双花括号值，就像 `FileTemplateEngine` 所做的那样。`compat: true` 使 `#each` 内的名称回退到外部上下文，因此本教程的模板在 Handlebars 下按原样渲染。Handlebars 不知道 `partials/` 文件夹和布局：使用 `Handlebars.registerPartial()` 注册局部，并自行在邮件周围渲染布局。对于 [MJML](https://mjml.io)，在返回 HTML 之前使用 `mjml2html()` 转换渲染的 MJML。对于缺失或损坏的模板，抛出 `MailTemplateError`：它是永久性的，因此出库会给邮件打死信标签而不是重试它。

#### 编写自己的传输器

对于包未提供传输器的提供者，请扩展 `MailTransport`。其 `send()` 接收完成的消息，并在提供者接受它后解析。一个用于 Mailgun 的传输器，其 `messages.mime` 端点将消息作为 MIME 接收，就像 `SesTransport` 将其发送到 SES 那样：

```typescript title="mail/mailgun.transport.ts"
import {
  MailProviderError,
  MailTransport,
  type MailMessage,
  type MailTransportResult,
  type MailTransportSendOptions,
} from '@nestjs/mail';

export interface MailgunTransportOptions {
  domain: string;
  apiKey: string;
  /** `https://api.eu.mailgun.net` for a domain in the EU region. */
  baseUrl?: string;
}

/** Sends the finished MIME message through Mailgun's `messages.mime` endpoint. */
export class MailgunTransport extends MailTransport {
  readonly #apiKey: string;
  private readonly url: string;

  constructor({ domain, apiKey, baseUrl = 'https://api.mailgun.net' }: MailgunTransportOptions) {
    super();
    this.#apiKey = apiKey;
    this.url = `${baseUrl}/v3/${encodeURIComponent(domain)}/messages.mime`;
  }

  async send(message: MailMessage, { signal }: MailTransportSendOptions): Promise<MailTransportResult> {
    const form = new FormData();
    // The envelope names every recipient; the MIME message leaves Bcc out
    form.append('to', message.envelope.to.join(','));
    form.append('message', new Blob([new Uint8Array(message.toMime())]), 'message.eml');

    // An abort rejects with signal.reason; a network error is transient, so the mailer retries it
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`api:${this.#apiKey}`).toString('base64')}` },
      body: form,
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });

    if (!response.ok) {
      const retryAfter = Number(response.headers.get('retry-after'));
      // Permanent for 4xx except 408, 409 and 429: those and 5xx are retried
      throw new MailProviderError({
        provider: 'mailgun',
        status: response.status,
        detail: await response.text(),
        ...(retryAfter > 0 && { retryAfterMs: retryAfter * 1_000 }),
      });
    }

    const { id } = (await response.json()) as { id?: string };
    return { accepted: message.envelope.to, providerMessageId: id };
  }
}

```

像内置传输器一样，传入一个实例作为 `transport`。`send(message, options)` 接收：

- **`message`。** 一个经过验证和冻结的 `MailMessage`：`from`、`to`、`cc`、`bcc`、`replyTo`、`subject`、`html`、`text`、`attachments`、`headers` 和 `messageId`。`envelope` 包含 SMTP 邮件头，每个收件人只出现一次，包括 Bcc，而 `toMime()` 以 MIME 形式返回消息，不包含 Bcc 头部。在每次尝试中都是同一个对象。
- **`signal`。** 当调用者取消发送时中止，例如当处理程序超出其超时时，出库中继会中止。停止请求，并使用 `signal.reason` 拒绝；邮件发送器不会重试中止。
- **`idempotencyKey`。** 调用者的密钥，在每次尝试和每次重试中都相同。将其发送到执行请求去重的提供者，如 `ResendTransport` 所做的那样；`Message-ID` 已经从其派生出来。
- **`attempt`。** 首次尝试为 1，首次重试为 2。

它解析为 `accepted`，提供者接收的邮件头收件人（未指定时全部），`providerMessageId` 和 `response`，后者又由邮件发送器的 `send()` 解析。

它抛出的异常决定了邮件发送器是否重试。抛出一个 `MailError`，其 `permanent` 说明再次发送相同消息是否可能成功：对于 HTTP API 的拒绝，使用 `MailProviderError`（对于 4xx 状态码，除了 408、409 和 429 外，是永久性的，除非您自己传递 `permanent`），对于失败或缓慢的请求使用 `MailConnectionError` 和 `MailTimeoutError`。任何其他错误都被视为瞬态，除非它具有 `permanent: true` 或 4xx `status`，因此来自 `fetch` 的网络错误会被重试。带有 `retryAfterMs` 的错误会使邮件发送器在下一次尝试前至少等待该时间，最长不超过 `maxDelay`。

一个持有连接或客户端的传输器实现 `close()`，该方法在应用程序关闭时运行，在正在进行的发送完成之后。

#### 试用

应用迁移，这将添加两个客户和四个产品：

```bash
$ export DATABASE_URL=postgres://localhost:5432/store
$ npx drizzle-kit migrate

```

使用默认设置启动应用程序：文件传输和中继正在运行。为 Ada 下订单：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"customerId":"ada","items":[{"productId":"salmon-kibble-2kg","quantity":2},{"productId":"feather-wand","quantity":1}]}'
{"id":"fd2bfc1c-db5c-455c-8876-bf7331a1029c","number":1001,"customerId":"ada","items":[{"productId":"salmon-kibble-2kg","name":"Salmon kibble, 2 kg","quantity":2,"price":2499},{"productId":"feather-wand","name":"Feather wand toy","quantity":1,"price":799}],"total":5797,"placedAt":"2026-09-25T10:59:00.173Z"}

```

在发送任何邮件之前就收到了响应。片刻后，中继的处理程序渲染邮件，文件传输将其写入：

```bash
[Nest] 37252  - 09/25/2026, 12:59:00 PM     LOG [FileMailTransport] "Your order #1001" to ada@example.com written to var/mail/2026-09-25T10-59-00-199Z--LtIZd5B_AiZek3-x8nOt88YfUYjgkZi-42ff80.eml

```

该文件是 SMTP 将传输的完全相同的消息。其头部和文本部分如下：

```bash
$ head -33 var/mail/*.eml
From: Orders <orders@example.com>
To: Ada Lovelace <ada@example.com>
Subject: Your order #1001
Date: Fri, 25 Sep 2026 10:59:00 +0000
Message-ID: <-LtIZd5B_AiZek3-x8nOt88YfUYjgkZi@example.com>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="=_bTCd1MQ5LoxTNFNN0nLRwu8d"

--=_bTCd1MQ5LoxTNFNN0nLRwu8d
Content-Type: multipart/alternative; boundary="=_9HVDyVBGuLsAaijTpu4Y2_XU"

--=_9HVDyVBGuLsAaijTpu4Y2_XU
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: quoted-printable

Hi Ada Lovelace,

thank you for your order! We are packing it now.

Product Qty Price
Salmon kibble, 2 kg 2 $49.98
Feather wand toy 1 $7.99

Total: $57.97

View your order (https://shop.example.com/orders/fd2bfc1c-db5c-455c-8876-bf=
7331a1029c)

Your invoice is attached.

The customer care team
--=_9HVDyVBGuLsAaijTpu4Y2_XU
Content-Type: multipart/related; boundary="=_u7PgKDXrb-x3mIz35ZArIBAa"

```

需要注意的几点：

- `Message-ID` 源自出库消息的 id，而不是随机的。重新投递将携带相同的 id。
- 文本部分是从 HTML 派生的，其中包含书写的链接。
- 正文是 quoted-printable 编码的，这使得每一行都足够短，可以被任何邮件服务器接受：链接第一行的末尾的 `=` 将其与下一行连接起来。

HTML、Logo 和发票如下：

```bash
$ grep -E '^Content-(Type|Disposition|ID):' var/mail/*.eml | tail -5
Content-Type: image/png; name="logo.png"
Content-Disposition: inline; filename="logo.png"
Content-ID: <logo@example.com>
Content-Type: application/pdf; name="invoice-1001.pdf"
Content-Disposition: attachment; filename="invoice-1001.pdf"

```

在邮件客户端中打开文件以查看渲染后的邮件。要编辑模板，请在浏览器中打开预览。响应是邮件的 HTML，布局中的模板，以及作为 `data:` URL（此处缩短）内联的 Logo：

```bash
$ curl localhost:3000/dev/mail/order-confirmation

```

```html
<!DOCTYPE html>
<html>
<body>
<p><img src="data:image/png;base64,…" alt="Logo" width="120" height="32"></p>
<p>Hi Ada Lovelace,</p>
<p>thank you for your order! We are packing it now.</p>
<table>
  <tr><th>Product</th><th>Qty</th><th>Price</th></tr>
  <tr>
    <td>Salmon kibble, 2 kg</td>
    <td>2</td>
    <td>$49.98</td>
  </tr>
  <tr>
    <td>Feather wand toy</td>
    <td>1</td>
    <td>$7.99</td>
  </tr>
</table>
<p><strong>Total: $57.97</strong></p>
<p><a href="https://shop.example.com/orders/00000000-0000-4000-8000-000000000000">View your order</a></p>
<p>Your invoice is attached.</p>

<p>The customer care team</p>
</body>
</html>

```

接下来，为一个不存在的产品下订单：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"customerId":"ada","items":[{"productId":"salmon-kibble-2kg","quantity":1},{"productId":"catnip-mouse","quantity":1}]}'
{"message":"Unknown product \"catnip-mouse\"","error":"Bad Request","statusCode":400}

```

事务回滚，随之回滚的是 `order.placed` 消息，没有写入邮件。

最后，查看 [the customer's language](/application/mail#send-it-in-the-customers-language) 的工作情况。为 Zofia 下订单，她在注册时选择了波兰语：

```bash
$ curl -X POST localhost:3000/orders \
    -H 'Content-Type: application/json' \
    -d '{"customerId":"zofia","items":[{"productId":"feather-wand","quantity":1}]}'
{"id":"7fa5ce1f-9ef3-49b0-8de9-a2d98056c299","number":1002,"customerId":"zofia","items":[{"productId":"feather-wand","name":"Feather wand toy","quantity":1,"price":799}],"total":799,"placedAt":"2026-09-25T10:59:00.424Z"}

```

```bash
[Nest] 37252  - 09/25/2026, 12:59:00 PM     LOG [FileMailTransport] "Twoje zamówienie #1002" to zofia@example.com written to var/mail/2026-09-25T10-59-00-453Z-GnMdyKUxVa0FRBJ6wZ2k5snIWsdQmwC2-697a51.eml

```

正文来自 `order-confirmation.pl.html`。波兰语主题和 Zofia 的名字作为编码单词到达文件，她的发票是 `faktura-1002.pdf`：

```bash
$ head -3 var/mail/2026-09-25T10-59-00-453Z-GnMdyKUxVa0FRBJ6wZ2k5snIWsdQmwC2-697a51.eml
From: Orders <orders@example.com>
To: =?UTF-8?Q?Zofia_W=C3=B3jcik?= <zofia@example.com>
Subject: =?UTF-8?Q?Twoje_zam=C3=B3wienie_=231002?=

```

#### 测试

将传输器替换为 `InMemoryMailTransport`。它会保留收到的每封邮件，并提供查找和读取邮件的辅助函数：

```typescript title="test/order-confirmation.e2e-spec.ts"
import { PGlite } from '@electric-sql/pglite';
import { getDrizzleToken } from '@nestjs/drizzle';
import { InMemoryMailTransport, MailSmtpError, MailTransport } from '@nestjs/mail';
import { OutboxDeadLetters, OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { OrderConfirmationMail } from '../src/notifications/order-confirmation.mail.js';
import { OrdersService } from '../src/orders/orders.service.js';

describe('Order confirmation mail', () => {
  const client = new PGlite(); // PostgreSQL in-process
  const mailbox = new InMemoryMailTransport();
  let moduleRef: TestingModule;
  let orders: OrdersService;
  let relay: OutboxRelay;

  beforeAll(async () => {
    const db = drizzle({ client });
    // Your migrations: the tables, and the seeded customers and products. The outbox's store
    // creates its own schema in init().
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    process.env.OUTBOX_RELAY = 'off'; // no poll loop: the test drives the relay
    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getDrizzleToken())
      .useValue(db) // the outbox's store runs on it too
      .overrideProvider(MailTransport)
      .useValue(mailbox)
      .compile();
    await moduleRef.init();
    orders = moduleRef.get(OrdersService);
    relay = moduleRef.get(OutboxRelay);
  });

  afterAll(async () => {
    await moduleRef.close();
    await client.close();
  });

  beforeEach(() => mailbox.clear());

  it('confirms the order with the invoice and a link to it', async () => {
    const order = await orders.placeOrder({ customerId: 'ada', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });
    mailbox.assertNotSent(); // nothing until the relay publishes the committed order

    await relay.runOnce();

    const mail = mailbox.assertSent({ to: 'ada@example.com', mail: OrderConfirmationMail });
    expect(mail.subject).toBe(`Your order #${order.number}`);
    expect(mail.attachment(`invoice-${order.number}.pdf`).contentType).toBe('application/pdf');
    expect(mail.link('/orders/').pathname).toBe(`/orders/${order.id}`);
  });

  it('dead-letters a confirmation the mail server refuses', async () => {
    mailbox.failNext(new MailSmtpError('RCPT TO', { code: 550, text: 'User unknown' }));
    await orders.placeOrder({ customerId: 'ada', items: [{ productId: 'salmon-kibble-2kg', quantity: 1 }] });

    await relay.runOnce();

    mailbox.assertNotSent();
    const [deadLetter] = await moduleRef.get(OutboxDeadLetters).list();
    expect(deadLetter).toMatchObject({ topic: 'order.placed', reason: 'rejected' });
  });
});

```

- **除了网络部分，其他一切都是真实的。** 邮件类渲染其模板，目录和发票提供者、出库和收件箱运行，消息完全构建，包括头部和附件。只有投递被替换了。
- **数据库是 PostgreSQL，进程内。** PGlite（`@electric-sql/pglite`，开发依赖项）运行您的真实迁移，并且测试会用它覆盖数据库 `DrizzleModule` 注册的（其令牌来自 `getDrizzleToken()`），因此仓储和出库存储使用它。没有需要启动的服务器，每个测试文件都会获得一个全新的数据库。
- **`assertSent()`** 根据收件人（`to` 匹配到，包括抄送和密送）、`subject`、邮件类或 `template` 或谓词返回最近匹配的邮件。如果没有匹配项，它会抛出一个列出已发送内容的错误。`assertNotSent()`、`filter()`、`find()` 和 `mails` 涵盖了其余部分。辅助函数抛出普通错误，因此它们可与任何测试运行器一起工作。
- **`link()`** 返回邮件中包含字符串或匹配正则表达式的第一个链接，作为一个 `URL`。对于密码重置或魔术链接，这就是整个测试：发送邮件，然后调用 `mail.link('/reset-password').searchParams.get('token')` 并点击链接。实体被解码，因此转义写入查询字符串的 `&amp;` 再次是 `&`。
- **`failNext()`** 使下一次发送抛出错误，这里是一个永久的 SMTP 错误，以测试错误路径。
- **`raw`** 是 MIME 格式的消息，而 `mailer.render()` 独立渲染邮件类或模板，用于模板的单元测试。

#### 生产检查清单

- 为发送域配置 SPF、DKIM 和 DMARC。HTTP 提供者在域通过验证后使用 DKIM 签名；使用 SMTP 时，使用 `dkim` 选项或在中继处签名。
- 保持 STARTTLS 必需，并开启证书验证。对于使用私有 CA 的中继，请传递 `tls.ca` 而不是关闭验证。
- 将凭证保存在环境变量或密钥存储中。传输器在私有字段中保存它们，错误消息绝不会包含它们。
- 在提交后，通过出库发送事务性邮件，在处理程序中使用 `retry: false`，并且出库的重试策略应根据提供者可能离线的时间来设置。
- 对于可能运行两次的处理程序发送的每封邮件，请传递 `idempotencyKey`。
- 将永久邮件错误转换为死信，并对 `dead-lettered` 出库事件进行警报。拒绝的地址通常意味着注册时的拼写错误或邮箱已不存在。
- 监控 `MailEvents`，或 `nestjs:mail:sent` 和 `nestjs:mail:failed` 诊断通道，以检测投递失败和发送缓慢的情况。
- 在生产环境中通过 `SmtpTransport` 或 HTTP 提供者的传输器发送。`FileMailTransport` 写入本地磁盘，容器重启或替换时会丢失；`LogMailTransport` 仅记录日志：两者都用于开发，而 `InMemoryMailTransport` 用于测试。当其中一个使用 `NODE_ENV=production` 运行时，模块会在启动时发出警告。
- 通过 `PostgresOutboxStore` 或另一个已注册的存储，将出库的消息保留在应用程序的数据库中，这样排队的邮件才能与其订单一起提交并存活重启。如果没有存储，出库将使用 `NODE_ENV=production` 拒绝启动，存储在迁移未应用时也是如此：在部署时应用它们，如 [the outbox tutorial](/reliability/outbox#keep-messages-in-your-database) 所示。
- 将模板与 CLI 的资源一起发布到 `dist`，并在生产环境中保持模板缓存开启（这是默认设置）：`cache: false` 会为每封邮件重新读取文件。
- 不要将仅用于开发的路由（例如预览）注册到生产环境中。
- 使用 `app.enableShutdownHooks()`，这样部署会等待正在传输的邮件并关闭 SMTP 连接。

#### 参考

##### 模块选项

`MailModule.forRoot()` 接受这些选项，一个 `forRootAsync()` 工厂返回它们。当使用 `useClass` 或 `useExisting` 代替 `useFactory` 时，该类实现了 `MailOptionsFactory`，其 `createMailOptions()` 返回它们。`transport`、`templates`、`imports` 和 `isGlobal` 也与 `useFactory`、`useClass` 或 `useExisting` 在 `forRootAsync()` 中相邻。解析后的选项在 `MAIL_MODULE_OPTIONS` 令牌下提供。

| 选项 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `transport` | `MailTransport` 实例或类 | 无 (必需) | 邮件如何离开应用程序。Nest 会实例化一个类，因此它可以注入配置。参见 [Send in production](/application/mail#send-in-production)。 |
| `templates` | `MailTemplateEngine` 实例或类 | 无 | 渲染命名了 `template` 的邮件：`FileTemplateEngine` 或 [your own](/application/mail#use-another-template-engine)。Nest 会实例化一个类。如果没有，带有模板的邮件将以 `MailTemplateError` 失败。 |
| `from` | address | 无 | 默认发件人。没有发件人的消息将以 `MailMessageError` 失败。 |
| `replyTo` | address 或 array | 无 | 默认回复地址。 |
| `headers` | `Record<string, string>` | 无 | 添加到每条消息中。消息自身的头部优先。 |
| `retry` | number, `false` 或重试选项 | 3 次尝试 | 每次发送的尝试次数，带有从 `1s` 翻倍到 `30s` 的退避和完全抖动。`false` 执行一次尝试。参见 [Send after the order commits](/application/mail#send-after-the-order-commits)。 |
| `imports` | modules | 无 | 传输器或模板引擎类注入的模块的导出。 |
| `isGlobal` | `boolean` | `true` | 全局注册 `Mailer`、`MailEvents`、`MailTransport` 和 `MailTemplateEngine`。 |

重试选项是 `attempts`（总数，包括第一次）、`backoff`（包含 `delay`、`factor`、`maxDelay` 和 `jitter` 的对象，或尝试的函数）和 `retryIf`（只能缩小重试哪些瞬态错误）。当 HTTP 提供者以 `Retry-After` 头部响应时，通常是 429 或 503，错误将其保持为 `retryAfterMs`，邮件发送器至少等待该时间后才进行下一次尝试，最多到 `maxDelay`（带有退避函数的 `30s`）。`signal` 仍然会结束等待。SMTP 响应没有 `Retry-After`，带有 `retry: false` 的出库处理器将等待留给出库的退避机制。

##### 模板引擎

`FileTemplateEngine` 接受：

| 选项 | 类型 | 默认值 | 描述 |
| --- | --- | --- | --- |
| `dir` | `string` | 无 (必需) | 模板的目录，其中部分文件位于其 `partials/` 文件夹中。相对路径相对于工作目录解析。 |
| `layout` | `string` | 无 | 一个包装每封邮件 HTML 的模板，将其置于 `body` 周围的三重花括号内。如果存在，则有 `.txt` 版本包装文本。 |
| `cache` | `boolean` | `true` | 将编译的模板和文件存在于内存中。`false` 为每封邮件读取文件，以便在开发中查看编辑。 |

使用 locale `pt-BR` 的 `template: 'order-confirmation'` 会渲染 `order-confirmation.pt-BR.html`、`order-confirmation.pt.html` 和 `order-confirmation.html` 中存在的第一个文件，以及同名且文本部分使用 `.txt` 的第一个文件，如果有的话。模板名称是字母、数字、`-` 和 `_`，在由 `/` 分隔的文件夹中。其他名称和非语言标签的 locale 将以 `MailTemplateError` 失败，因此都无法访问 `dir` 之外的文件。

##### 模板语法

该语法是 Handlebars 的一个子集：

<table>
  <tr>
    <th>Syntax</th>
    <th>Renders</th>
  </tr>
  <tr>
    <td><code>{{ customer.name }}</code></td>
    <td>值，经过 HTML 转义。路径使用点，<code>items.0</code> 是数组的第一个元素。缺失的值渲染为空。在 <code>.txt</code> 模板中，值保持原样。</td>
  </tr>
  <tr>
    <td><code>{{{ body }}}</code></td>
    <td>值保持原样，用于你自己生成的 HTML。使用 <code>html</code> 标签构建的 HTML 也像这样插入在双大括号之间。</td>
  </tr>
  <tr>
    <td><code>{{#if paid}} … {{else}} … {{/if}}</code></td>
    <td>当值为真时显示的第一部分，否则显示 <code>else</code> 部分，它是可选的。<code>false</code>、<code>0</code>、空字符串、空列表和缺失的值是假值。<code>{{else if pending}}</code> 链式调用另一个条件。</td>
  </tr>
  <tr>
    <td><code>{{#unless paid}} … {{/unless}}</code></td>
    <td>与 <code>#if</code> 相反，带有可选的 <code>else</code> 部分。</td>
  </tr>
  <tr>
    <td><code>{{#each items}} … {{else}} … {{/each}}</code></td>
    <td>对于列表的每个元素或对象的每个值执行一次第一部分；对于空或缺失的列表执行 <code>else</code> 部分。</td>
  </tr>
  <tr>
    <td><code>this, &#64;index, &#64;first, &#64;last, &#64;key</code></td>
    <td>在 <code>#each</code> 内部：元素、从 0 开始的位置、是否是第一个或最后一个，以及对象的键。如果元素没有名称，则在外部上下文中查找。</td>
  </tr>
  <tr>
    <td><code>../number, &#64;root.shop</code></td>
    <td>当前 <code>#each</code> 之外的上下文，以及模板的上下文。</td>
  </tr>
  <tr>
    <td><code>{{> signature}}</code></td>
    <td>在邮件的 locale 中，使用包含它的上下文，引用部分 <code>partials/signature.html</code>（在文本模板中为 <code>.txt</code>）。</td>
  </tr>
  <tr>
    <td><code>{{! note }}, {{!-- note --}}</code></td>
    <td>注释，不会输出。第二种形式可以包含双大括号。</td>
  </tr>
  <tr>
    <td><code>\{{</code></td>
    <td>字面量双大括号。</td>
  </tr>
</table>

没有帮助函数和表达式。值从上下文自身的属性中读取，绝不从原型中读取，并且不调用函数。任何其他内容位于双大括号之间、未关闭的块以及标签内但不在带引号的属性值内的双大括号值都会以 `MailTemplateError` 失败，该错误包含 `file`、`line` 和 `column`。

##### 发送选项

`mailer.send(MailClass, options)` 和 `mailer.send(message)` 接受以下参数：

| 选项 | 描述 |
| --- | --- |
| `to`, `cc`, `bcc` | 一个地址或一个数组。一个地址是一个只包含一个地址的字符串，或者一个包含 `name` 和 `address` 的对象。`bcc` 只进入 SMTP 信封。 |
| `data` | 邮件类的数据，类型来自其 `render()`。 |
| `locale` | 传递给渲染上下文中的 `render()`，以及传递给模板引擎，模板引擎会选择相应的模板。参见 [Send it in the customer's language](/application/mail#send-it-in-the-customers-language)。 |
| `from`, `replyTo` | 覆盖模块的默认值。 |
| `subject`, `html`, `text` | 内联编写消息的内容。当省略时，`text` 从 `html` 派生。 |
| `template`, `context` | 消息体渲染的模板以及它读取的值，替代 `html` 和 `text`。邮件类的 `render()` 以相同方式返回它们。 |
| `attachments` | 每个都有 `filename`、`content`（一个 `Buffer`、字符串或流）或一个本地 `path`，以及可选的 `contentType` 和 `cid`。参见 [Attach the invoice and preview the mail](/application/mail#attach-the-invoice-and-preview-the-mail)。 |
| `headers` | 自定义头部，例如 `List-Unsubscribe`。 |
| `retry` | 对本次发送覆盖模块的 `retry`。 |
| `signal` | 一个 `AbortSignal`，它会停止发送和任何尝试之间的等待。 |
| `idempotencyKey` | 跨重试识别邮件。`Message-ID` 由其派生。 |

`mailer.render(MailClass, options)` 和 `mailer.render(message)` 接受相同参数，但不包含投递选项，并解析为 `MailMessage`，该对象记录其 `template` 和 `locale`。`send()` 解析为 `messageId`、`providerMessageId`（如果提供者有的话）、`accepted`（接受的信封收件人）、`response`（最终 SMTP 响应）和 `attempts`。

##### 传输器

| 传输器 | 选项 | 幂等性键 |
| --- | --- | --- |
| `SmtpTransport` | `url` 或 `host`, `port`, `secure`, `startTls`（`required`, `opportunistic` 或 `never`；默认 `required`，localhost 为 `opportunistic`), `auth`（`user` 带有 `pass` 或 `accessToken`), `authMethod`（`PLAIN`, `LOGIN` 或 `XOAUTH2`), `name`, `tls`, `pool`, `timeouts`, `dkim`（`domainName`, `keySelector`, `privateKey`, `headers`） | 仅派生的 `Message-ID` |
| `ResendTransport` | `apiKey`, `baseUrl`, `timeout`, `fetch` | `Idempotency-Key`, 24 小时 |
| `PostmarkTransport` | `serverToken`, `messageStream`（默认 `outbound`), `baseUrl`, `timeout`, `fetch` | 无 |
| `SendGridTransport` | `apiKey`, `baseUrl`, `timeout`, `fetch` | 无 |
| `SesTransport` | `region`, `credentials`, `configurationSetName`, `endpoint`, `timeout`, `fetch` | 无 |
| `FileMailTransport` | `directory`, `log` | 仅限开发环境 |
| `LogMailTransport` | `body`, `logger` | 仅限开发环境 |
| `InMemoryMailTransport` | 无 | 仅限测试，参见 [Testing](/application/mail#测试) |

`InMemoryMailTransport.mails` 列出所有接收到的邮件，按最旧的在前，作为一个 `SentMail`，该对象也由 `filter()`、`find()` 和 `assertSent()` 返回。一个 `SentMail` 包含消息的 `messageId`、`from`、`to`、`cc`、`bcc`、`subject`、`html`、`text`、`attachments`、`headers`、`mail`（邮件类）、`template` 和 `locale`，以及 `sentAt`（当传输器接收到它时）、`raw`（MIME 源）、`links`（所有链接，先是 HTML 中的，然后是仅文本部分中的）、`link()`、`attachment()` 和 `message`，即 `MailMessage` 本身。`clear()` 忘记了所有这些。

使用 `pool: true`，`SmtpTransport` 保持最多 5 个连接，每个连接发送最多 100 条消息，并在空闲 30 秒后关闭连接；一个包含 `maxConnections`、`maxMessages` 和 `idleTimeout` 的对象作为 `pool` 会更改这些限制。其默认超时时间是连接的 `30s`，问候的 `30s`，每个命令的 `1m` 和数据的 `5m`。HTTP 提供者的超时时间是每个请求的 `30s`。

##### 事件

`MailEvents.events$` 在每次发送后（包括重试后）发出一个事件。每个事件也会在 `node:diagnostics_channel` 通道上发布。

| 事件类型 | 通道 | 何时 | 有效载荷 |
| --- | --- | --- | --- |
| `sent` | `nestjs:mail:sent` | 传输器接受了消息。 | `messageId`, `mail`, `recipients`, `subject`, `transport`, `attempts`, `durationMs`, `providerMessageId` |
| `failed` | `nestjs:mail:failed` | 发送在重试后失败，或在第一次尝试前被 `signal` 中止（`attempts` 为 0）。 | 相同的字段，但不包括 `providerMessageId`，以及 `error` 和 `permanent` |

验证失败的消息在任何事件之前抛出。

##### 错误

每个错误都继承自 `MailError`，该错误包含 `permanent`（再次发送相同消息无法成功）和 `code`（SMTP 响应代码或提供者的 HTTP 状态）。邮件器仅重试非永久性错误。参见 [Send after the order commits](/application/mail#send-after-the-order-commits)。

| 错误 | 何时 | 永久性 |
| --- | --- | --- |
| `MailMessageError` | 消息无效，在发送任何内容之前。`field` 命名字段，`status` 为 400。 | 是 |
| `MailConnectionError` | DNS、拒绝或重置连接、TLS 或证书。`cause` 包含套接字错误。 | 否，除非是配置问题，例如需要 STARTTLS 但服务器没有 |
| `MailTimeoutError` | 某个阶段超时。包含 `phase` 和 `timeoutMs`。 | 否 |
| `MailSmtpError` | SMTP 错误响应。包含 `code`, `enhancedCode`, `command` 和 `response`。 | 对于 5xx 响应 |
| `MailRecipientsRejectedError` | 服务器拒绝了一个或多个收件人，但没有发送任何内容。`rejected` 列出了它们。继承自 `MailSmtpError`。 | 当任何拒绝是 5xx 时 |
| `MailTemplateError` | 缺少模板或模板无法编译，或者邮件在没有模板引擎的情况下命名了模板。包含 `template`，以及文件中的问题 `file`, `line` 和 `column`。 | 是 |
| `MailProviderError` | HTTP 提供者拒绝了请求。包含 `code`（HTTP 状态）、`provider`、`providerCode` 和 `retryAfterMs`，当响应包含有效的 `Retry-After` 时。 | 对于 4xx，但不包括 408、409 和 429 |