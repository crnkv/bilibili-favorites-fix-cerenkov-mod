// ==UserScript==
// @name         哔哩哔哩(B站|Bilibili)收藏夹Fix (cerenkov修改版)
// @namespace    http://tampermonkey.net/
// @version      1.3.0
// @description  修复 哔哩哔哩(www.bilibili.com) 失效的收藏。（可查看av号、简介、标题、封面、数据等）
// @author       cerenkov
// @license      GPL-3.0
// @match        *://space.bilibili.com/*/favlist*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/1.11.0/jquery.min.js
// @resource iconError https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/error.png
// @resource iconSuccess https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/success.png
// @resource iconInfo https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/info.png
// @connect      biliplus.com
// @connect      api.bilibili.com
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_getResourceURL
// @grant        GM_openInTab
// ==/UserScript==

/*jshint esversion: 8 */
(function() {
    'use strict';

    /**
     * 失效收藏标题颜色(默认为灰色)。
     * @type {String}
     */
    const invalTitleColor = "#999";

    /**
     * 是否启用调试模式。
     * 启用后，浏览器控制台会显示此脚本运行时的调试数据。
     * @type {Boolean}
     */
    const isDebug = false;

    // 值为 true : 简化查询（新模式）。不再调用历史归档查询，更快出结果，且更不容易碰到“请求过快”警告。反正常规查询查不到的，历史归档查询基本上也查不到。适合有大量失效视频的收藏夹
    // 值为 false: 深度查询（旧模式）。即Mr.Po原脚本所用逻辑。常规查询失败时会调用历史归档查询，花费更多时间，且更容易碰到“请求过快”警告，但似乎得不到更多的结果。适合失效视频数量不多的情况
    let tryLess = true;

    /**
     * 重试延迟[秒]。
     * @type {Number}
     */
    const retryDelay = 5;

    /**
     * 每隔 interval [毫秒]检查一次，是否有新的收藏被加载出来。
     * 此值越小，检查越快；过小会造成浏览器卡顿。
     * @type {Number}
     */
    const interval = 2000;

    let isFirefox = false;
    let isChromium = false;
    let brands = GM_info.userAgentData.brands;
    if (brands && brands.length > 0) {
        if (brands.some(x => x.brand.match(/firefox/i))) {
            isFirefox = true;
        } else if (brands.some(x => x.brand.match(/chromium|chrome|edge/i))) {
            isChromium = true;
        }
    }
    // 阿B是真丢人啊，Firefox下，一旦标题<a>内文字过长出现text-overflow，菜单按钮就无法在鼠标hover时显示
    // 这么基础的毛病，新UI铺开之前都测试不出来吗？
    // 对于一般视频问题不大，但失效恢复视频的功能很需要这个功能菜单
    // 在阿B修好之前，只能我代为临时处理一下了
    function stripTitleFirefox(title) {
        if (isFirefox && title.length > 24) {
            return title.slice(0,24)+"..";
        } else {
            return title;
        }
    }

    // 是否B站新网页界面，在首次（每次）运行handleFavorites()时会检测网页并记录在该变量中
    let isNewUI = false;

    // 缓存已经查询过并且有结果的视频标题和封面（包括查到的和查不到的，不包括查询过程中请求过快、网络错误和解析错误的）
    let cache = {};

    var XOR_CODE = 23442827791579n;
    var MASK_CODE = 2251799813685247n;
    var BASE = 58n;
    var CHAR_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

    function bv2av(bvid) {
        const bvidArr = Array.from(bvid);
        [bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]];
        [bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]];
        bvidArr.splice(0, 3);
        const tmp = bvidArr.reduce((pre, bvidChar) => pre * BASE + BigInt(CHAR_TABLE.indexOf(bvidChar)), 0n);
        return Number((tmp & MASK_CODE) ^ XOR_CODE);
    }

    /**
     * 处理收藏
     */
    function handleFavorites() {
        isNewUI = $("div.fav-list-main div.items").length > 0;
        if (isDebug) console.log(`[bilibili-fav-fix] isNewUI: ${isNewUI}`);

        // 失效收藏节点集
        let $targetItems = null;
        if (isNewUI) {
            $targetItems = $("div.fav-list-main div.items > div").filter(function (i, item) { return $(item).find(".bili-video-card__title a").first().text() == "已失效视频"; });
        } else if ($("ul.fav-video-list.content").length > 0) {
            $targetItems = $("ul.fav-video-list.content li.small-item.disabled");
        } else {
            console.error('[bilibili-fav-fix] B站网页样式无法识别');
        }
        if (isDebug) console.log(`[bilibili-fav-fix] $targetItems.length: ${$targetItems.length}`);

        if ($targetItems.length > 0) {
            console.info(`[bilibili-fav-fix] ${$targetItems.length}个收藏待修复...`);

            showDetail($targetItems);

            $targetItems.each(function(i, item) {
                const $item = $(item);
                const bvid = getItemBVID($item);
                const avid = bv2av(bvid);
                if (isDebug) console.log(`[bilibili-fav-fix] BVID needed to fix: ${bvid}`);

                // 更改封面图超链接和标题行超链接，跳过新UI的up主行的超链接
                const $aElems = $item.find("a:not(.bili-video-card__author)");
                $aElems.attr("href", `https://www.biliplus.com/video/av${avid}/`);
                $aElems.attr("target", "_blank");

                addCopyAVIDButton($item, avid);
                addCopyBVIDButton($item, bvid);

                // 移除禁用样式
                if (!isNewUI) {
                    $item.removeClass("disabled");
                    $aElems.removeClass("disabled");
                }

                const $titleElem = $($aElems[1]);
                if (cache[avid]) {
                    if (cache[avid].success) {
                        // 从缓存中读出
                        fixFavorites($item, $titleElem, avid, cache[avid].title, cache[avid].pic, cache[avid].history, cache[avid].parts);
                    } else {
                        fixFailed($item, $titleElem, avid);
                    }
                } else {
                    fixTitleAndPic($item, $titleElem, avid);
                }
            });
        }
    }

    /**
     * 显示详细
     * @param  {$节点} $targetItems 失效收藏节点集
     */
    function showDetail($targetItems) {
        const url = getBilibiliApiUrl();
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: "json",
            onload: function(res) {
                const json = res.response;
                const medias = json.data.medias;

                $targetItems.each(function(i, item) {
                    const $item = $(item);
                    const bvid = getItemBVID($item);
                    if (isDebug) console.log(`[bilibili-fav-fix] showDetail: ${bvid}`);

                    let media = medias.filter((m) => (m.bvid == bvid));
                    if (media.length > 0) {
                        media = media[0];
                        if (isDebug) console.log(media);
                    } else {
                        console.warn(`[bilibili-fav-fix] ${bvid} not found in Bilibili API JSON (wrong params?): ${url}`);
                        return;
                    }

                    let title = media.title;
                    if (title == "已失效视频") {
                        // 如果 biliplus 查询先有了结果并且被保存在节点上，则使用 biliplus 得来的数据
                        if ($item.attr("_title")) title = $item.attr("_title");
                    }
                    let duration = new Date(media.duration * 1000).toISOString().slice(11, 19);
                    if (duration.slice(0, 2) == "00") duration = duration.slice(3);

                    // 以前在 media.pages 里有子P标题，现在好像B站删了
                    // 如果 biliplus 查询先有了结果并且被保存在节点上，则使用 biliplus 得来的数据
                    let partTitles = null;
                    if ($item.attr("_parts")) partTitles = $item.attr("_parts");
                    if (media.pages) partTitles = media.pages.map((page, i, arry) => "* "+page.title).join("\n");
                    const partsInfo = ( (media.page > 1) ? `分P数量：${media.page}\n` : "" ) + ( partTitles ? `子P标题：\n${partTitles}\n` : "" );

                    let reason;
                    if (media.attr) {
                        if (media.attr == 0) {
                            reason = "未失效(0)";
                        } else if (media.attr == 9) {
                            reason = "UP主自己删除(9)";
                        } else if (media.attr == 1) {
                            reason = "其他原因删除(1)";
                        } else {
                            reason = `原因编号意义未明(${media.attr})`;
                        }
                    }

                    const content = `AV号：${media.id}
BV号：${bvid}
标题：${title}
UP主：${media.upper.name} （https://space.bilibili.com/${media.upper.mid}）
简介：${media.intro}
时长：${duration}
发布时间：${new Date(media.pubtime * 1000).toLocaleString()}
收藏时间：${new Date(media.fav_time * 1000).toLocaleString()}
${partsInfo}播放数：${media.cnt_info.play}
收藏数：${media.cnt_info.collect}
弹幕数：${media.cnt_info.danmaku}
失效原因：${reason}`;
                    const $aElems = $item.find("a:not(.bili-video-card__author)");
                    const $coverElem = $aElems.first();
                    $coverElem.attr("title", content);

                    addCopyInfoButton($item);
                    addOpenUpSpaceButton($item, media.upper.mid);
                    addToggleModeButton($item);
                    addSaveLoadCacheButton($item);
                });
            }
        });
    }

    function getBilibiliApiUrl() {
        let fid = window.location.href.match(/fid=(\d+)/i);
        if (fid) {
            fid = fid[1];
        } else if (isNewUI) {
            fid = $("div.fav-sidebar-item:has(.vui_sidebar-item--active)").first().attr("id");
        } else {
            fid = $("li.fav-item.cur").first().attr("fid");
        }
        if (isDebug) console.log(`[bilibili-fav-fix] fid: ${fid}`);

        let pn = 1;
        if (isNewUI) {
            pn = $("div.vui_pagenation--btns .vui_button.vui_button--active").text().trim();
        } else {
            pn = $("ul.be-pager li.be-pager-item.be-pager-item-active").text().trim();
        }
        if (isDebug) console.log(`[bilibili-fav-fix] pn: ${pn}`);

        let order = "mtime";
        if (isNewUI) {
            order = $("div.fav-list-header-filter__left div.radio-filter__item--active").first().text().trim();
        } else {
            order = $($("div.fav-filters > div")[2]).find("span").first().text().trim();
        }
        order = new Map([["最近收藏", "mtime"], ["最多播放", "view"], ["最新投稿", "pubtime"], ["最近投稿", "pubtime"]]).get(order);
        if (order === undefined) order = "mtime";    // 执行收藏夹搜索时无从得知排序，只能手动指定成“最近收藏”，不保证结果正确
        if (isDebug) console.log(`[bilibili-fav-fix] order: ${order}`);

        let tid = 0;
        if (isNewUI) {
            tid = $("div.fav-list-header-collapse div.radio-filter__item--active").first().text().trim().replace(/\s+\d+/, "");
        } else {
            tid = $($("div.fav-filters > div")[1]).find("span").first().text().trim();
        }
        tid = new Map([["全部分区", 0], ["动画", 1], ["音乐", 3], ["游戏", 4], ["娱乐", 5], ["电视剧", 11], ["番剧", 13], ["电影", 23], ["知识", 36], ["鬼畜", 119], ["舞蹈", 129], ["时尚", 155], ["生活", 160], ["国创", 167], ["纪录片", 177], ["影视", 181], ["资讯", 202], ["美食", 211], ["动物圈", 217], ["汽车", 223], ["运动", 234], ["科技", 188], ["版权内容", -24]]).get(tid);
        if (tid === undefined) tid = 0;    // 一些被下线和撤除的分区，无从得知其名称和tid，只能手动指定成“全部分区”，返回的结果很大概率不包含目标视频的数据
        if (isDebug) console.log(`[bilibili-fav-fix] tid: ${tid}`);

        let searchType = 0;
        let keyword = "";
        if (isNewUI) {
            if ($("div.fav-list-header-filter__desc").length > 0) {
                searchType = $("div.fav-list-header-filter__right button").first().text().trim();
                searchType = new Map([["当前", 0], ["全部", 1]]).get(searchType);
                keyword = encodeURIComponent($("div.fav-list-header-filter__right input").first().val());
            }
        } else {
            if ($("div.search-results-num").length > 0) {
                searchType = $("div.search-types > div > div").first().text().trim();
                searchType = new Map([["当前", 0], ["全部", 1]]).get(searchType);
                keyword = encodeURIComponent($("input.search-fav-input").first().val());
            }
        }
        if (isDebug) console.log(`[bilibili-fav-fix] searchType: ${searchType}\n[bilibili-fav-fix] keyword: ${keyword}`);

        return `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${fid}&pn=${pn}&ps=${isNewUI ? 40 : 20}&keyword=${keyword}&order=${order}&type=${searchType}&tid=${tid}&platform=web`;
    }

    function getItemBVID($item) {
        if ($item.attr("bvid")) {
            return $item.attr("bvid");
        }
        let bvid = "";
        if (isNewUI) {
            bvid = $item.find(".bili-cover-card").first().attr("href").match(/bilibili\.com\/video\/(\w+)/i)[1];
        } else {
            bvid = $item.attr("data-aid");
        }
        $item.attr("bvid", bvid);
        return bvid;
    }

    function addCopyAVIDButton($item, avid) {
        addButton($item, "复制AV号", function() {
            GM_setClipboard(`av${avid}`, "text");
            tipSuccess("AV号复制成功！");
        });
    }

    function addCopyBVIDButton($item, bvid) {
        addButton($item, "复制BV号", function() {
            GM_setClipboard(bvid, "text");
            tipSuccess("BV号复制成功！");
        });
    }

    function addCopyInfoButton($item) {
        addButton($item, "复制稿件信息", function() {
            const $aElems = $item.find("a:not(.bili-video-card__author)");
            const $coverElem = $aElems.first();
            GM_setClipboard($coverElem.attr("title"), "text");
            tipSuccess("稿件信息复制成功！");
        });
    }

    function addOpenUpSpaceButton($item, mid) {
        addButton($item, "跳转UP主空间", function () {
            GM_openInTab(`https://space.bilibili.com/${mid}`, {active: true, insert: true, setParent: true});
        });
    }

    function addToggleModeButton($item) {
        addButton($item, function () { return tryLess ? "切至深度查询" : "切至简化查询"; }, function () {
            if (tryLess) {
                tryLess = false;
                for (let k of Object.keys(cache)) {
                    if (!cache[k].success) delete cache[k];
                }
                $(".bili-fav-fix-menu-item").each(function (i, item) {
                    if ($(item).text() == "切至深度查询") $(item).text("切至简化查询");
                })
                tipSuccess("已切至深度查询（旧模式），更花时间，查询结果未必更多，且更容易碰到“请求过快”需手动加载，适合失效视频数量不多的情况");
            } else {
                tryLess = true;
                $(".bili-fav-fix-menu-item").each(function (i, item) {
                    if ($(item).text() == "切至简化查询") $(item).text("切至深度查询");
                })
                tipSuccess("已切至简化查询（新模式），速度更快，查询结果或许有漏，但不容易碰到“请求过快”警告，适合有大量失效视频的收藏夹");
            }
        });
    }

    function addSaveLoadCacheButton($item) {
        addButton($item, "导出/导入缓存", function () {
            if (unsafeWindow.confirm("【导出】点击确定，即可将当前标签页脚本运行期间查询到的标题/封面缓存数据导出至剪贴板（缓存将在网页刷新时消失）")) {
                GM_setClipboard(JSON.stringify(cache), "text");
                tipSuccess("缓存导出至剪贴板成功！");
            } else {
                let input = unsafeWindow.prompt("【导入】粘贴输入缓存数据，即可导入至当前标签页脚本中（缓存将在网页刷新时消失）");
                if (input) {
                    try {
                        cache = JSON.parse(input);
                        tipSuccess("缓存导入成功！");
                    } catch (e) {
                        tipError("缓存导入失败！");
                    }
                }
            }
        });
    }

    function addButton($item, name, fun) {
        if (isNewUI) {
            const $dropdownTrigger = $item.find(".bili-card-dropdown").first();
            $dropdownTrigger.hover(
                function() {
                    setTimeout(function() {
                        if (typeof name == "function") name = name();
                        // 延时获取dropdownMenu元素，因为B站新UI动态生成该元素
                        const $dropdownMenu = $(".bili-card-dropdown-popper.visible").first();
                        if (! $dropdownMenu.find(".bili-fav-fix-menu-item").text().includes(name) ) {
                            const $menuItem = $(`<div class="bili-card-dropdown-popper__item bili-fav-fix-menu-item">${name}</div>`);
                            $menuItem.click(fun);
                            $dropdownMenu.append($menuItem);
                        }
                    }, 500);
                }, function() {}
            );
        } else {
            if (typeof name == "function") name = name();
            const $dropdownMenu = $item.find(".be-dropdown-menu").first();
            if (! ($dropdownMenu.find(".bili-fav-fix-menu-item").text().includes(name)) ) {
                const $lastChild = $dropdownMenu.children().last();
                // 未添加过扩展
                if (!$lastChild.hasClass('bili-fav-fix-menu-item')) {
                    $lastChild.addClass("be-dropdown-item-delimiter");
                }

                const $menuItem = $(`<li class="be-dropdown-item bili-fav-fix-menu-item">${name}</li>`);
                $menuItem.click(fun);
                $dropdownMenu.append($menuItem);
            }
        }
    }

    function tipInfo(text) {
        tip(text, "iconInfo");
    }

    function tipError(text) {
        tip(text, "iconError");
    }

    function tipSuccess(text) {
        tip(text, "iconSuccess");
    }

    function tip(text, iconName) {
        GM_notification({
            text: text,
            image: GM_getResourceURL(iconName)
        });
    }



    /**
     * 修复标题和海报
     * @param  {$节点}  $item 当前收藏Item
     * @param  {$节点}  $titleElem  标题链接
     * @param  {数字}   avid av号
     */
    function fixTitleAndPic($item, $titleElem, avid) {
        $titleElem.text("Loading...");
        fixTitleAndPicEnhance3($item, $titleElem, avid);    // 常规查询入口
    }

    /**
     * 修复标题和海报 增强 - 3
     * 模拟常规查询
     * @param  {$节点}    $item 当前收藏Item
     * @param  {$节点}    $titleElem  标题链接
     * @param  {数字}     avid av号
     */
    function fixTitleAndPicEnhance3($item, $titleElem, avid) {

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com/video/av${avid}/`,
            onload: function(response) {
                try {
                    if (isDebug) {
                        console.log("[bilibili-fav-fix] 3---->：");
                        console.log(response.response);
                    }

                    let jsonRegex = response.responseText.match(/window\.addEventListener\('DOMContentLoaded',function\(\){view\((.+)\);}\);/);
                    if (isDebug) console.log(jsonRegex);

                    const jsonStr = jsonRegex[1];
                    if (isDebug) console.log(jsonStr);

                    const res = $.parseJSON(jsonStr);
                    if (res.title) { // 存在
                        let partTitles = null;
                        if (res.list && res.list.length > 1) {
                            partTitles = res.list.map((part, i, arry) => part.part);
                        }
                        fixFavorites($item, $titleElem, avid, res.title, res.pic, null, partTitles);
                    } else if (res.code == -503) { // 请求过快
                        // 出现提示手动点击加载，转入API查询
                        retryLoad($titleElem, avid, null, function() {
                            fixTitleAndPicEnhance0($item, $titleElem, avid, true);
                        });
                    } else { // 常规查询无结果
                        if (tryLess) { // 简化查询，常规查询失败就失败，不再尝试历史归档查询，反正大概率也查不到
                            fixFailed($item, $titleElem, avid);
                        } else {
                            $titleElem.text("常规查询无结果，转入历史归档查询...");
                            fixTitleAndPicEnhance1($item, $titleElem, avid);
                        }
                    }
                } catch (e) { // 网页内容解析错误（很可能是请求过快）,出现提示手动点击加载，转入API查询
                    console.error("[bilibili-fav-fix] 常规查询结果解析出错（很可能是请求过快）");
                    retryLoad($titleElem, avid, null, function() {
                        fixTitleAndPicEnhance0($item, $titleElem, avid, true);
                    });
                }
            },
            onerror: function(e) {
                $titleElem.text("常规查询出错，请检查网络连接");
            }
        });
    }

    /**
     * 修复标题和海报 增强 - 0
     * 使用公开的API
     * @param  {$节点}   $item 当前收藏Item
     * @param  {$节点}   $titleElem  标题链接
     * @param  {数字}    avid av号
     * @param  {布尔}    delayRetry 延迟重试
     */
    function fixTitleAndPicEnhance0($item, $titleElem, avid, delayRetry) {
        // 传入的delayRetry似乎只有true，即遇到503时永远需要强制延迟
        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com/api/view?id=${avid}`,
            responseType: "json",
            onload: function(response) {
                const res = response.response;
                if (isDebug) {
                    console.log("[bilibili-fav-fix] 0---->：");
                    console.log(res);
                }

                if (res.title) { // 找到了
                    let partTitles = null;
                    if (res.list && res.list.length > 1) {
                        partTitles = res.list.map((part, i, arry) => part.part);
                    }
                    fixFavorites($item, $titleElem, avid, res.title, res.pic, null, partTitles);
                } else if (res.code == -503) { // 请求过快
                    retryLoad($titleElem, avid, delayRetry, function() {
                        fixTitleAndPicEnhance0($item, $titleElem, avid, true);
                    });
                } else { // API查询无结果（或json解析格式出错）
                    if (tryLess) { // 简化查询，API查询失败就失败，不再尝试历史归档查询，反正大概率也查不到
                        fixFailed($item, $titleElem, avid);
                    } else {
                        $titleElem.text("API查询无结果，转入历史归档查询...");
                        fixTitleAndPicEnhance1($item, $titleElem, avid);
                    }
                }
            },
            onerror: function(e) {
                console.error("[bilibili-fav-fix] API查询出错");
                $titleElem.text("API查询出错，请检查网络连接");
            }
        });
    }

    /**
     * 修复标题和海报 增强 - 1
     * 使用cache库 （历史归档查询）
     * @param  {$节点}  $item 当前收藏Item
     * @param  {$节点}  $titleElem  标题链接
     * @param  {数字}   avid av号
     */
    function fixTitleAndPicEnhance1($item, $titleElem, avid) {

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com/all/video/av${avid}/`,
            onload: function(response) {
                try {
                    if (isDebug) {
                        console.log("[bilibili-fav-fix] 1---->：");
                        console.log(response.response);
                    }

                    const params = response.responseText.match(/getjson\('(\/api\/view_all.+)'/);
                    fixTitleAndPicEnhance2($item, $titleElem, avid, params[1]);    // 不传入delayRetry参数，第一次503时可立刻点击重载
                } catch (e) { // 网页内容解析错误
                    console.error("[bilibili-fav-fix] 历史归档查询结果解析出错(1)或请求过快");
                    $titleElem.text("历史归档查询结果解析出错(1)或请求过快");
                }
            },
            onerror: function(e) {
                $titleElem.text("历史归档查询出错(1)，请检查网络连接");
            }
        });
    }

    /**
     * 修复标题和海报 增强 - 2
     * 使用cache库，第一段，需与fixTitleAndPicEnhance1连用
     * @param  {$节点}    $item       当前收藏Item
     * @param  {$节点}    $titleElem          标题链接
     * @param  {数字}     avid        av号
     * @param  {字符串}    param       待拼接参数
     * @param  {布尔}     delayRetry  延迟重试
     */
    function fixTitleAndPicEnhance2($item, $titleElem, avid, param, delayRetry) {

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com${param}`,
            responseType: "json",
            onload: function(response) {
                try {
                    const res = response.response;
                    if (isDebug) {
                        console.log("[bilibili-fav-fix] 2---->：");
                        console.log(res);
                    }

                    if (!res.code) throw "JSON格式不正确";
                    if (res.code === 0) { // 找到了
                        let partTitles = null;
                        if (res.data.parts && res.data.parts.length > 1) {
                            partTitles = res.data.parts.map((part, i, arry) => part.part);
                        }
                        fixFavorites($item, $titleElem, avid, res.data.info.title, res.data.info.pic, "all/", partTitles);
                    } else if (res.code == -503) { // 请求过快
                        retryLoad($titleElem, avid, delayRetry, function() {
                            fixTitleAndPicEnhance2($item, $titleElem, avid, param, true);
                        });
                    } else { // 历史归档查询无结果
                        fixFailed($item, $titleElem, avid);
                    }
                } catch (e) { // JSON内容解析错误
                    console.error("[bilibili-fav-fix] 历史归档查询结果解析出错(2)");
                    $titleElem.text("历史归档查询结果解析出错(2)");
                }
            },
            onerror: function(e) {
                $titleElem.text("历史归档查询出错(2)，请检查网络连接");
            }
        });
    }

    /**
     * 修复收藏
     * @param  {$节点}    $item   当前收藏Item
     * @param  {$节点}    $titleElem      标题链接
     * @param  {数字}     avid    av号
     * @param  {字符串}    title   标题
     * @param  {字符串}    pic     海报
     * @param  {字符串}    history 历史归档，若无时，使用 null
     * @param  {字符串列表}    parts   子P标题，默认为 null
     */
    function fixFavorites($item, $titleElem, avid, title, pic, history, parts) {

        // 录入缓存
        if (!cache[avid] || !(cache[avid].success)) {
            cache[avid] = {success: true, title: title, pic: pic};
            if (history) cache[avid].history = history;
            if (parts) cache[avid].parts = parts;
        }

        // 设置多个超链接跳转 biliplus
        const $aElems = $item.find("a:not(.bili-video-card__author)");
        $aElems.attr("href", `https://www.biliplus.com/${history ? history : ""}video/av${avid}/`);

        // 设置标题文字
        $titleElem.text(stripTitleFirefox(title));
        $titleElem.attr("title", title);

        // 保存标题和子P标题到节点上，以便让 showDetail 读取
        $item.attr("_title", title);
        if (parts) parts = "* "+parts.join("\n* ");
        if (parts) $item.attr("_parts", parts);

        // 如果 showDetail 已经生成浮块，则替换浮块中的文本
        const $coverElem = $aElems.first();
        let content = $coverElem.attr("title");
        if (content) {
            content = content.replace(/\n标题：.*\n/, `\n标题：${title}\n`);
            if (parts) content = content.replace("播放数：", `子P标题：\n${parts}\n播放数：`);
            $coverElem.attr("title", content);
        }

        // 设置标题样式
        setInvalItemStyle($item, $titleElem);

        // 替换封面
        const $img = $item.find("img");
        $img.attr("src", pic);
        $item.find("source").remove();
    }

    function fixFailed($item, $titleElem, avid) {
        $titleElem.text(`查不到标题/封面（${avid}）`);
        $titleElem.attr("title", `查不到标题/封面（${avid}）`);
        // 录入缓存
        if (!cache[avid]) cache[avid] = {success: false};
    }

    /**
     * 标记失效的收藏
     * @param  {$节点}  $item 当前收藏Item
     * @param  {$节点}  $titleElem  标题链接
     */
    function setInvalItemStyle($item, $titleElem) {
        // 增加 删除线 + 置(灰)
        $titleElem.attr("style", `text-decoration:line-through;color:${invalTitleColor};`);
        // 收藏时间 + UP主（新UI）
        let $subtitle;
        if (isNewUI) {
            $subtitle = $item.find("div.bili-video-card__subtitle");
        } else {
            $subtitle = $item.find("div.meta.pubdate");
        }
        // 增加 删除线
        $subtitle.attr("style", "text-decoration:line-through");
    }

    /**
     * 再次尝试加载
     * @param  {$节点}    $titleElem          标题链接
     * @param  {数字} avid        AV号
     * @param  {布尔} delayRetry  延迟重试
     * @param  {函数} fun         重试方法
     */
    function retryLoad($titleElem, avid, delayRetry, fun) {

        console.warn(`[bilibili-fav-fix] 查询：av${avid}，请求过快！`);

        if (delayRetry) { // 延迟绑定
            $titleElem.text(`请求过快，${retryDelay}秒后再试！`);
            setTimeout(bindReload, retryDelay * 1000, $titleElem, fun);
            countdown($titleElem, retryDelay);
        } else { // 首次，立即绑定
            $titleElem.attr("href", "javascript:void(0);");
            $titleElem.attr("target", "_self");
            bindReload($titleElem, fun);
        }
    }

    /**
     * 绑定重新加载
     * @param  {$节点}  $titleElem  标题链接
     * @param  {函数}   fun 重试方法
     */
    function bindReload($titleElem, fun) {
        $titleElem.text("->点击手动加载<-");
        $titleElem.click(function() {
            $(this).unbind("click");
            $titleElem.text("Loading...");
            fun();
        });
    }

    /**
     * 重新绑定倒计时
     * @param  {$节点}    $titleElem      标题链接
     * @param  {数字}     second  秒
     */
    function countdown($titleElem, second) {
        if ($titleElem.text().indexOf("请求过快") === 0) {
            $titleElem.text(`请求过快，${second}秒后再试！`);
            if (second > 1) {
                setTimeout(countdown, 1000, $titleElem, second - 1);
            }
        }
    }

    setInterval(handleFavorites, interval);
})();