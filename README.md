# 哔哩哔哩(B站|Bilibili)收藏夹Fix (cerenkov修改版)

---

> 篡改猴（Tampermonkey）脚本，用于修复B站失效收藏。

## 代码托管

[Greasyfork页面](https://greasyfork.org/zh-CN/scripts/489224)
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
[GitHub仓库](https://github.com/crnkv/bilibili-favorites-fix-cerenkov-mod)


## Chrome 系浏览器注意

由于其 Manifest V3 更新的要求，必须[启用开发者模式/开发人员模式](https://www.tampermonkey.net/faq.php#Q209)才能正常运行篡改猴（Tampermonkey）扩展，影响范围 Chrome / Edge


## 功能

- 修复视频的标题和封面
	- **此功能依赖于第三方网站 biliplus.com 的信息缓存，如果查不到标题/封面，说明 biliplus 不幸地并没有在该视频被删前缓存到其标题/封面信息，这是常有的事**
- 鼠标悬停时，封面之上展示播放、收藏、UP主、投稿四项信息
	- 此功能仅为展示网页上被隐藏起来的内容，B站网页（旧界面）本来就有
	- B站新界面不再自带这些内容
- 鼠标悬停时，弹出浮块展示AV、BV号、UP主、简介、时长、发布、收藏时间、收藏数、弹幕数、失效原因等信息
	- 此功能从B站端口自动获取
	- 现在的B站端口只告知分P数量，不再提供子P标题，所以仅当标题/封面修复成功时可从 biliplus 获取到子P标题并展示
- 点击右下角操作菜单，可以复制AV、BV号、稿件信息、跳转UP主空间、切换简化/深度查询、导出/导入缓存
	- 由于B站新界面是动态生成操作菜单，所以鼠标要多等0.5秒，才能保证将新菜单项添加到菜单上
- 关于简化查询/深度查询：
	- 旧版本及 Mr.Po 的原脚本采用的是深度查询，花费更多时间，而且多查一轮似乎并不能查到更多的信息，倒是更容易触发“请求过快”警告和需手动点击加载
	- 新版本初始默认为简化查询，更快出结果，且更不容易触发“请求过快”警告，适合有大量失效视频的收藏夹进行普查
	- 在从简化查询切换为深度查询时，缓存中“查不到标题/封面”的失败条目会被清除，以便对那些视频重新发起查询
- 关于缓存：
	- 同一个标签页在刷新/关闭之前，脚本查询过的结果会缓存起来，在收藏夹翻页、切换收藏夹时，已查询过的视频无需再次查询
	- 通过导出/导入缓存，可以手动保存已经查询的稿件信息的进度
- 现在即使更改排序方式、更改限定分区，以及在当前/全部收藏夹中搜索，脚本都能正常工作了
- 点击视频封面，可以跳转至 biliplus


## 声明

代码 fork 自 [Mr-Po/bilibili-favorites-fix](https://github.com/Mr-Po/bilibili-favorites-fix) ( Greasyfork 脚本[哔哩哔哩(B站|Bilibili)收藏夹Fix](https://greasyfork.org/zh-CN/scripts/383143) v1.2.1 )，因为该脚本在 2023 年 11 月或更早前就有小部分功能失效需要更新修复。[历史讨论](https://greasyfork.org/zh-CN/scripts/383143/discussions/214367)

本脚本的核心功能依赖于第三方网站 biliplus.com 的信息缓存，非常感谢 biliplus 长久以来的付出。


## 画面展示

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

### v1.3.2 - 2025.03.07
- 变更
	- 由于B站新UI的渲染bug已被修复，所以移除临时补丁 stripTitleFirefox

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
