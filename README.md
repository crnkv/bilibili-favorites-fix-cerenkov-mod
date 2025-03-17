# 哔哩哔哩(B站|Bilibili)收藏夹Fix (cerenkov修改版)

---

> 篡改猴（Tampermonkey）脚本，用于修复B站失效收藏、以及被up主隐藏（“仅自己可见”）的视频。

## 代码托管

[Greasyfork页面](https://greasyfork.org/zh-CN/scripts/489224)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
[GitHub仓库](https://github.com/crnkv/bilibili-favorites-fix-cerenkov-mod)


## Chrome 系浏览器注意

由于其 Manifest V3 更新的要求，必须[启用开发者模式/开发人员模式](https://www.tampermonkey.net/faq.php#Q209)才能正常运行篡改猴（Tampermonkey）扩展，影响范围 Chrome / Edge


## 功能

- 修复视频的标题和封面
	- **此功能依赖于第三方网站 biliplus.com 和 jijidown.com 的信息缓存，如果查不到标题/封面，说明 biliplus 和 jijidown 不幸地并没有在该视频被删前缓存到其标题/封面信息，这是常有的事**
- 恢复被隐藏的视频（被up主“仅自己可见”），让收藏夹不再“缺一角”
	- 只能恢复公开收藏夹中的这些隐藏视频
- 鼠标悬停时，会弹出浮块展示AV、BV号、UP主、简介、时长、发布、收藏时间、分P标题、收藏数、弹幕数、失效原因等信息
	- 此功能从B站API端口自动获取
	- **点击视频封面可以复制全部稿件信息到剪贴板**
	- 对于公开收藏夹，B站端口可以获取分P视频的子P标题（如果幸运的话，即B站没针对性删除的话），而且，对于只有1P的稿件，该子P标题被视为可能就是视频标题
	- 对于私密收藏夹，B站端口获取不了子P标题，但假如幸运的话 biliplus 有其信息缓存，则可以将视频标题与子P标题一并恢复
	- **由于 biliplus 和 jijidown 缓存到的信息有限，很多失效视频如果要想恢复标题，还得靠B站端口泄露的子P信息，因此可将私密收藏夹临时改成公开后，让本脚本进行修复和本地缓存，然后再改回私密**
- 点击视频收藏右下角功能菜单，可以复制AV、BV号、稿件信息、导出/导入缓存、删除单个视频对应缓存、查看封面图片、跳转UP主空间
	- 由于B站新界面是动态生成操作菜单，所以鼠标要多等0.5秒，才能保证将新菜单项添加到菜单上
- 脚本查询过的结果会本地缓存起来，储存在篡改猴（Tampermonkey）中，已查询过的视频无需再次查询，关闭浏览器也不丢失，并且可按需导出/导入
	- 如果想清空本地缓存，只需在菜单询问“是否导出”时选择取消，在询问“粘贴导入”时输入“`{}`”确定即可
	- 对于单独一条视频的缓存信息，在功能菜单中“删除本条缓存”可以删掉
- 在B站旧界面中，鼠标悬停时，封面之上会展示播放、收藏、UP主、投稿四项信息（B站新界面已不再有这个）
	- 此功能仅为展示网页上被隐藏起来的内容，B站网页（旧界面）本来就有
- 现在即使更改排序方式、更改限定分区，以及在当前/全部收藏夹中搜索，脚本都能正常工作了
- 如果数据来自 biliplus 或 jijidown ，点击视频标题可以跳转过去


## 声明

代码 fork 自 [Mr-Po/bilibili-favorites-fix](https://github.com/Mr-Po/bilibili-favorites-fix) ( Greasyfork 脚本[哔哩哔哩(B站|Bilibili)收藏夹Fix](https://greasyfork.org/zh-CN/scripts/383143) v1.2.1 )，因为该脚本在 2023 年 11 月或更早前就有小部分功能失效需要更新修复。[历史讨论](https://greasyfork.org/zh-CN/scripts/383143/discussions/214367)

本脚本的核心功能依赖于第三方网站 biliplus.com 和 jijidown.com 的信息缓存，非常感谢 biliplus 和 jijidown 长久以来的付出。


## 画面展示

<s>脚本更新至 v1.4.2 而展示截图暂未更新，望见谅</s>

- **例：成功修复标题、封面及简介信息**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/success.png)

- **例：B站新界面，与旧界面有些许差异**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/newUI.png)

- **例：成功修复标题，但封面失败，因为查出来的图片网址已不可访问**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/half-success.png)

- **例：查不到标题/封面信息，只有简介信息等可以展示**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/fail.png)

- **例：当不止一个分P时，展示子P标题（仅当标题/封面修复成功时才能获取到该信息）**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/parts.png)

- **例：点击右下角操作菜单，可以复制AV、BV号、稿件信息、跳转UP主空间、切换简化/深度查询、导出/导入缓存**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/menu.png)

- **例：更改排序方式，仍可正常工作**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/order.png)

- **例：更改限定分区，仍可正常工作**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/category.png)

- **例：在当前/全部收藏夹中搜索，搜索结果页仍可正常工作**

![](https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/screenshots/search.png)


## Changelog

### v1.4.2 - 2025.03.17
- 修复
	- 弃用 jQuery.data() ，规范化 jQuery.on("click") ，以阻止网页更新时内存泄漏
- 变更
	- 简化功能菜单的操作体验，油猴的 GM_notification 通知似乎有点太拖了，整简单点

### v1.4.1 - 2025.03.17
- 修复
	- 修复因网络故障中断时，视频缓存仍未建立导致的对象访问错误（ queryFailed 函数）
	- 补上获取默认收藏夹 fid 时应有的 mid
	- 修复在全部收藏夹中搜索时调用API不相符的问题，使得搜索结果页面能正确地修复失效视频，但是由于B站两个API返回的搜索结果顺序不一致，所以依然无法保证完整恢复隐藏视频，如果搜索结果第一页还是缺几格，那么往后翻第二页说不定就会出现所缺的那几个隐藏视频，只是由于API获取信息不全导致它被挪到了后一页
- 新增
	- 对于up主名称是“账号已注销”的，将查询得到的up主名字替换上去并缓存起来
	- 增量导入功能：在使用导入功能时，在字符串`{...}`的开头加上`+`号前缀，则将其内容以视频avid为单位增量填入缓存中，而不是把整个 JSON 对象替换到缓存
- 优化
	- 通过并列 img 元素，使得当查询 biliplus 得到的封面图链接失效、而 first_frame 链接仍有效的时候，浏览器自动隐藏失效的封面图、展示可用的 first_frame 图，而当点击“查看封面图片”时，会将封面图和首帧截图一起打开
	- 优化代码，减少逻辑冗余，增加可读性
- 变更
	- 点击封面的效果改为复制稿件信息

### v1.4.0 - 2025.03.14
- 修复
	- 当 url 不含 fid 且网页源码亦不含默认收藏夹的 fid 时，查询简介等信息会出错，需要另发网络请求才能获取默认收藏夹的 fid
- 新增
	- 对于被隐藏的视频（表现为收藏夹缺了一格，而不是显示“已失效视频”），亦即被up主设为“仅自己可见”的视频（而不是被B站删除/退回），如果是在公开收藏夹，现在能够恢复了，如果是私密收藏夹就请手动改成公开收藏夹才能恢复
	- 使用 Tampermonkey 的存储来保存缓存，不再需要在刷新/关闭标签页前手动导出缓存保存查询进度
	- 除了在 biliplus 查询信息以外，还加入在 jijidown 查询失效视频信息，从而能找回更多的标题/封面信息
	- 新增操作菜单：新标签页查看封面图片、查看视频首帧截图、清除本视频的缓存信息
- 优化
	- 鼠标悬停浮块增加点赞数、投币数、回复数、视频分区信息
	- 混合使用B站的新API和旧API：对于公开收藏夹将优先查询旧API、获取潜在的藏在分P内的视频标题、并保存在缓存中，同时将分P第一P标题视作视频标题候选，从而能找回更多视频的标题。（对于私密收藏夹则查询新API，和之前一样）
	- 对于B站API和 biliplus 都返回信息的情况，完善取舍逻辑，refactor 处理流程，进一步大幅度简化和重写 biliplus 的查询流程，根治以前经常“请求过快”的问题
	- 即便查询 biliplus 返回了信息，但返回的封面图网址失效，那仍然会再查询 jijidown ，判断并获取真正有用的封面图
	- 用 MutationObserver 按需执行来取代以前的 setInterval 定时循环执行
- 变更
	- 由于B站新UI的渲染bug已被修复，所以移除临时补丁 stripTitleFirefox
	- 由于重写 biliplus 和 jijidown 的查询流程，不再保留之前的（没多大作用的）简化查询/深度查询

### v1.3.1 - 2024.12.16
- 修复
	- 360极速浏览器会获取不到 GM_info.userAgentData.brands

### v1.3.0 - 2024.12.10
- 修复
	- 多余的网址正则匹配导致脚本有时不运行
	- 完善网络查询过程中的意外错误处理，让脚本不再卡在Loading...上，且控制台和视频标题都提供更详细的错误信息
	- B站新界面在Firefox上的渲染有毛病，视频标题行太长的话，鼠标悬停时菜单按钮不出现，为保证菜单按钮在失效视频上出现只好临时应对B站新界面的bug，等B站修好再移除补丁
- 新增
	- 查询结果缓存，在收藏界翻页、切换收藏夹时，已查询过的视频无需再次查询，并且可以导出/导入保存查询进度
	- 在更改排序方式、更改限定分区，以及在当前/全部收藏夹中搜索时，脚本都能正常工作了（除了先更改排序方式后搜索，在搜索结果界面无法获取排序方式信息）
- 优化
	- 简化查询逻辑，将旧的查询流程改叫深度查询，深度查询花时间而作用不大，但保留切换功能
	- 将 biliplus 查询到的标题和子P标题信息同步给鼠标悬停浮块，方便一次性复制
	- 鼠标悬停浮块增加时长、失效原因信息
	- 代码 refactor ，增加可读性

### v1.2.1.2 - 2024.12.07
- 修复
	- B站推出新界面，适配B站新UI

### v1.2.1.1 - 2024.03.07
- 修复
	- 原脚本旧B站端口只能用于公开收藏夹，更新B站端口字段，恢复获取所有收藏夹视频的简介等信息
	- 旧BV号转AV号算法失效，更新算法，使用了 [bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/bvid_desc.md) 里的代码
	- B站将封面图的img元素放在了picture元素内、与另两个source元素并列，浏览器优先显示source元素，导致新替换上的封面图没显示出来，删除多余的source元素恢复封面展示
- 新增
	- 右下角操作菜单增加复制BV号
	- 右下角操作菜单增加一键跳转UP主空间
- 优化
	- 增加鼠标悬停时浮块的展示信息
	- 去掉了原脚本先判断封面图链接有效性后才替换图片的步骤，直接替换新图片链接，反正不会变得更糟

### v1.2.1
- Mr-Po 的原版脚本
