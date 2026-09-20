<!-- 此文件从 content/faq/request-lifecycle.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-09-12T07:42:56.380Z -->
<!-- 源文件: content/faq/request-lifecycle.md -->
<!-- 源哈希: dab4586aeadc44c15345ba2db7e7145c -->

### 请求生命周期

Nest 应用程序处理请求并生成响应的顺序，我们称之为**请求生命周期**。由于使用了中间件、管道、守卫和拦截器，要追踪特定代码在请求生命周期中的执行位置可能颇具挑战，尤其是当全局、控制器级别和路由级别的组件共同参与时。一般来说，请求依次流经中间件、守卫、拦截器、管道，最后在返回路径上（生成响应时）再次经过拦截器。

#### 中间件

中间件按特定顺序执行。首先，Nest 运行全局绑定的中间件（例如通过 `app.use` 绑定的中间件），然后运行基于路径确定的 [module bound middleware](/overview/middlewares)。中间件按照绑定的顺序依次执行，这与 Express 中中间件的工作方式类似。对于跨不同模块绑定的中间件，根模块中绑定的中间件会先执行，然后中间件按照模块添加到 `imports` 数组中的顺序依次执行。

#### 守卫

守卫的执行从全局守卫开始，然后是控制器守卫，最后是路由守卫。与中间件一样，守卫按照绑定的顺序执行。例如：

```typescript
@UseGuards(Guard1, Guard2)
@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @UseGuards(Guard3)
  @Get()
  getCats(): Cats[] {
    return this.catsService.getCats();
  }
}

```

`Guard1` 会在 `Guard2` 之前执行，而两者都会在 `Guard3` 之前执行。

> 信息 **提示** 在讨论全局绑定与控制器或局部绑定时，区别在于守卫（或其他组件）的绑定位置。如果你使用 `app.useGlobalGuards()` 或通过模块提供该组件，则它是全局绑定的。否则，如果装饰器位于控制器类之前，则绑定到控制器；如果装饰器位于路由声明之前，则绑定到路由。

#### 拦截器

拦截器在很大程度上遵循与守卫相同的模式，但有一个例外：由于拦截器返回 [RxJS Observables](https://github.com/ReactiveX/rxjs)，Observable 将以后进先出的方式解析。因此，入站请求将按照标准的全局、控制器、路由级别顺序进行解析，但请求的响应侧（即从控制器方法处理器返回之后）将从路由到控制器再到全局进行解析。此外，管道、控制器或服务抛出的任何错误都可以在拦截器的 `catchError` 操作符中读取。

#### 管道

管道遵循标准的全局到控制器再到路由的绑定顺序，在 `@UsePipes()` 参数方面同样遵循先进先出的原则。然而，在路由参数级别，如果有多个管道运行，它们将按照从最后一个带管道的参数到第一个参数的顺序执行。这也适用于路由级别和控制器级别的管道。例如，如果我们有以下控制器：

```typescript
@UsePipes(GeneralValidationPipe)
@Controller('cats')
export class CatsController {
  constructor(private catsService: CatsService) {}

  @UsePipes(RouteSpecificPipe)
  @Patch(':id')
  updateCat(
    @Body() body: UpdateCatDTO,
    @Param() params: UpdateCatParams,
    @Query() query: UpdateCatQuery,
  ) {
    return this.catsService.updateCat(body, params, query);
  }
}

```

那么 `GeneralValidationPipe` 将针对 `query` 运行，然后是 `params`，接着是 `body` 对象，然后才继续处理 `RouteSpecificPipe`，后者遵循相同的顺序。如果存在任何参数特定的管道，它们将在控制器和路由级别的管道之后运行（同样是从最后一个参数到第一个参数）。

#### 过滤器

过滤器是唯一不先解析全局的组件。相反，过滤器从尽可能最低的级别开始解析，这意味着执行从任何路由绑定的过滤器开始，然后是控制器级别，最后是全局过滤器。请注意，异常不能在过滤器之间传递；如果路由级别的过滤器捕获了异常，控制器或全局级别的过滤器就无法捕获同一个异常。要实现类似效果的唯一方法是在过滤器之间使用继承。

> 信息 **提示** 过滤器仅在请求过程中发生任何未捕获异常时执行。已捕获的异常（例如通过 `try/catch` 捕获的异常）不会触发异常过滤器。一旦遇到未捕获的异常，生命周期的其余部分将被忽略，请求直接跳转到过滤器。从 [middleware](/overview/middlewares#错误处理) 抛出的异常也由异常层处理，但只有**全局**异常过滤器适用，因为中间件在路由处理器被选中之前运行。

#### 总结

总的来说，请求生命周期如下所示：

1. 入站请求
2. 中间件
   - 2.1. 全局绑定的中间件
   - 2.2. 模块绑定的中间件
3. 守卫
   - 3.1 全局守卫
   - 3.2 控制器守卫
   - 3.3 路由守卫
4. 拦截器（控制器之前）
   - 4.1 全局拦截器
   - 4.2 控制器拦截器
   - 4.3 路由拦截器
5. 管道
   - 5.1 全局管道
   - 5.2 控制器管道
   - 5.3 路由管道
   - 5.4 路由参数管道
6. 控制器（方法处理器）
7. 服务（如果存在）
8. 拦截器（请求之后）
   - 8.1 路由拦截器
   - 8.2 控制器拦截器
   - 8.3 全局拦截器
9. 异常过滤器
   - 9.1 路由
   - 9.2 控制器
   - 9.3 全局
10. 服务器响应