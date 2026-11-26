<!-- 此文件从 content/faq/request-lifecycle.md 自动生成，请勿直接修改此文件 -->
<!-- 生成时间: 2026-11-26T23:13:15.444Z -->
<!-- 源文件: content/faq/request-lifecycle.md -->
<!-- 源哈希: 0e5a30f80b903a538efcf916b5ec41d0 -->

### 请求生命周期

Nest 应用以**请求生命周期**的序列处理请求并产生响应。在中间件、管道、守卫和拦截器的参与下，尤其是在全局、控制器级别和路由级别组件组合时，跟踪特定代码在请求生命周期中运行的位置可能很具有挑战性。一般来说，请求依次经过中间件、然后是守卫、然后是拦截器、然后是管道，最后在返回路径上（即生成响应时）再次经过拦截器。

#### 中间件

中间件按特定顺序运行。首先，Nest 运行全局绑定的中间件（例如与`app.use()`绑定的中间件），然后运行[module-bound middleware](/overview/middlewares)，该中间件根据路径进行匹配。中间件按绑定的顺序顺序依次运行，就像 Express 中的中间件一样。对于绑定在不同模块中的中间件，全局模块的中间件（使用`@Global()`装饰器）首先运行，然后是根模块中绑定的中间件，最后是其他模块的中间件，顺序由其在导入图中的距离根模块的远近决定。

#### 守卫

守卫的执行从全局守卫开始，接着是控制器守卫，最后是路由守卫。与中间件一样，守卫按绑定的顺序运行。例如：

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

`Guard1` 将在 `Guard2` 之前执行，并且两者都将在 `Guard3` 之前执行。

> info **提示** “全局”、“控制器”和“路由”指的是守卫（或其他组件）的绑定位置。使用`app.useGlobalGuards()`（或类似方法）注册的组件，或通过带有`APP_GUARD`令牌（或类似令牌）的模块提供的组件，是全局绑定的。否则，如果装饰器在控制器类之前，则绑定到控制器；如果装饰器在路由处理程序之前，则绑定到路由。

#### 拦截器

拦截器大多遵循与守卫相同的模式，但有一个区别：由于拦截器返回[RxJS Observables](https://github.com/ReactiveX/rxjs)，可观察对象是按先进先出（first-in, last-out）的方式解析的。传入请求经过标准的全局、控制器、路由顺序，但响应侧（即路由处理程序返回后）是从路由到控制器再到全局解析的。此外，管道、控制器或服务抛出的任何错误都可以通过拦截器的`catchError` 操作符读取。

#### 管道

管道遵循标准的全局、控制器、路由顺序，传递给`@UsePipes()` 的管道按先进先出（first-in, first-out）顺序运行。然而，在路由参数级别，当多个参数具有管道时，管道会先处理最后一个参数，后处理第一个参数。这也适用于路由级别和控制器级别的管道。例如，考虑以下控制器：

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

在这里，对于`query`，`GeneralValidationPipe` 运行，然后是⟦IC_13】，然后是`body` 对象，之后再进行`RouteSpecificPipe`，顺序相同。任何特定于参数的管道（再次，从最后一个参数到第一个）将在控制器级别和路由级别的管道之后运行。

#### 过滤器

过滤器是唯一不先全局解析的组件。相反，过滤器从尽可能低的级别解析：Nest 首先检查路由绑定的过滤器，然后是控制器级别的过滤器，最后是全局过滤器。不能从一个过滤器传递异常给另一个过滤器；如果路由级别的过滤器捕获了异常，控制器级别或全局过滤器就无法捕获相同的异常。为达到类似效果，请在过滤器之间使用继承。

> info **提示** 只有在请求处理过程中发生未捕获的异常时，过滤器才会运行。您自己捕获的异常（例如使用`try/catch`）不会触发异常过滤器。一旦遇到未捕获的异常，其余的生命周期将被跳过，请求将直接进入过滤器。从[middleware](/overview/middlewares#错误处理) 抛出的异常也会被异常层处理，但只有**全局**异常过滤器适用，因为中间件在选择路由处理程序之前运行。

#### 总结

一般来说，请求生命周期如下所示：

1. 传入请求
2. 中间件
   - 2.1. 全局绑定的中间件
   - 2.2. 模块绑定的中间件
3. 守卫
   - 3.1 全局守卫
   - 3.2 控制器守卫
   - 3.3 路由守卫
4. 拦截器（预控制器）
   - 4.1 全局拦截器
   - 4.2 控制器拦截器
   - 4.3 路由拦截器
5. 管道
   - 5.1 全局管道
   - 5.2 控制器管道
   - 5.3 路由管道
   - 5.4 路由参数管道
6. 控制器（方法处理程序）
7. 服务（如果存在）
8. 拦截器（后请求）
   - 8.1 路由拦截器
   - 8.2 控制器拦截器
   - 8.3 全局拦截器
9. 异常过滤器
   - 9.1 路由过滤器
   - 9.2 控制器过滤器
   - 9.3 全局过滤器
10. 服务器响应