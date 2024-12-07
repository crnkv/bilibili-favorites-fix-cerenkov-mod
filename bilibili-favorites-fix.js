// ==UserScript==
// @name         哔哩哔哩(B站|Bilibili)收藏夹Fix
// @namespace    http://tampermonkey.net/
// @version      1.2.1.1
// @description  修复 哔哩哔哩(www.bilibili.com) 失效的收藏。（可查看av号、简介、标题、封面、数据等）
// @author       Mr.Po
// @license      MIT
// @match        https://space.bilibili.com/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/1.11.0/jquery.min.js
// @resource iconError https://cdn.jsdelivr.net/gh/Mr-Po/bilibili-favorites-fix/media/error.png
// @resource iconSuccess https://cdn.jsdelivr.net/gh/Mr-Po/bilibili-favorites-fix/media/success.png
// @resource iconInfo https://cdn.jsdelivr.net/gh/Mr-Po/bilibili-favorites-fix/media/info.png
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

    /**
     * 重试延迟[秒]。
     * @type {Number}
     */
    const retryDelay = 5;

    /**
     * 每隔 space [毫秒]检查一次，是否有新的收藏被加载出来。
     * 此值越小，检查越快；过小会造成浏览器卡顿。
     * @type {Number}
     */
    const space = 2000;

    /******************************************************/

    /**
     * 收藏夹地址正则
     * @type {RegExp}
     */
    const favlistRegex = /https:\/\/space\.bilibili\.com\/\d+\/favlist.*/;

    /**
     * 处理收藏
     */
    function handleFavorites() {

        const flag = favlistRegex.test(window.location.href);

        if (flag) { // 当前页面是收藏地址

            // 失效收藏节点集
            const $lis = $("ul.fav-video-list.content li.small-item.disabled");

            if ($lis.size() > 0) {

                console.info(`${$lis.size()}个收藏待修复...`);

                $lis.each(function(i, it) {

                    const bv = $(it).attr("data-aid");

                    // Mr.Po原脚本的bv2aid算法已经失效，函数 bv2aid 已更新为 bilibili-app-recommend 脚本所使用的算法
                    // 如果未来B站还继续更改它的bvid-avid算法，那干脆考虑将下文的 showDetail($lis) 代码放到前面， showDetail 函数已经通过B站端口直接获得了失效视频的avid（$media.id），那这里就只需引用即可，无需 bv2aid 函数
                    const aid = bv2aid(bv);

                    // 多个超链接
                    const $as = $(it).find("a");

                    $as.attr("href", `https://www.biliplus.com/video/av${aid}/`);
                    $as.attr("target", "_blank");

                    addCopyAVCodeButton($(it), aid);
                    
                    addCopyBVCodeButton($(it), bv);  // cerenkov-fork 添加功能

                    fixTitleAndPic($(it), $($as[1]), aid);

                    // 移除禁用样式
                    $(it).removeClass("disabled");
                    $as.removeClass("disabled");
                });

                showDetail($lis);
            }
        }
    }

    function addOperation($item, name, fun) {

        const $ul = $item.find(".be-dropdown-menu").first();

        const lastChild = $ul.children().last();

        // 未添加过扩展
        if (!lastChild.hasClass('be-dropdown-item-extend')) {
            lastChild.addClass("be-dropdown-item-delimiter");
        }

        const $li = $(`<li class="be-dropdown-item be-dropdown-item-extend">${name}</li>`);

        $li.click(fun);

        $ul.append($li);
    }

    function addCopyAVCodeButton($item, aid) {
        addOperation($item, "复制av号", function() {
            GM_setClipboard(`av${aid}`, "text");
            tipSuccess("av号复制成功！");
        });
    }

    // cerenkov-fork 添加功能
    function addCopyBVCodeButton($item, bv) {
        addOperation($item, "复制bv号", function() {
            GM_setClipboard(bv, "text");
            tipSuccess("bv号复制成功！");
        });
    }

    function addCopyInfoButton($item, content) {
        addOperation($item, "复制简介", function() {
            GM_setClipboard(content, "text");
            tipSuccess("简介复制成功！");
        });
    }

    // cerenkov-fork 添加功能
    function addOpenUpSpaceButton($item, mid) {
        addOperation($item, "跳转UP主空间", function () {
            GM_openInTab(`https://space.bilibili.com/${mid}`, {active: true, insert: true, setParent: true});
            tipSuccess("跳转UP主空间成功！");
        });
    }

    /**
     * 标记失效的收藏
     * @param  {$节点}  $it 当前收藏Item
     * @param  {$节点}  $a  标题链接
     */
    function signInval($it, $a) {

        // 收藏时间
        const $pubdate = $it.find("div.meta.pubdate");

        // 增加 删除线
        $pubdate.attr("style", "text-decoration:line-through");

        // 增加 删除线 + 置(灰)
        $a.attr("style", `text-decoration:line-through;color:${invalTitleColor};`);
    }

    /**
     * 绑定重新加载
     * @param  {$节点}  $a  标题链接
     * @param  {函数}   fun 重试方法
     */
    function bindReload($a, fun) {

        $a.text("->手动加载<-");

        $a.click(function() {

            $(this).unbind("click");

            $a.text("Loading...");

            fun();
        });
    }

    /**
     * 再次尝试加载
     * @param  {$节点}	$a  		标题链接
     * @param  {数字}	aid  		AV号
     * @param  {布尔}	delayRetry 	延迟重试
     * @param  {函数}	fun   		重试方法
     */
    function retryLoad($a, aid, delayRetry, fun) {

        console.warn(`查询：av${aid}，请求过快！`);

        if (delayRetry) { // 延迟绑定

            $a.text(`请求过快，${retryDelay}秒后再试！`);

            setTimeout(bindReload, retryDelay * 1000, $a, fun);

            countdown($a, retryDelay);

        } else { // 首次，立即绑定

            $a.attr("href", "javascript:void(0);");

            bindReload($a, fun);
        }
    }

    /**
     * 重新绑定倒计时
     * @param  {$节点}  	$a  	标题链接
     * @param  {数字} 	second 	秒
     */
    function countdown($a, second) {

        if ($a.text().indexOf("请求过快") === 0) {

            $a.text(`请求过快，${second}秒后再试！`);

            if (second > 1) {
                setTimeout(countdown, 1000, $a, second - 1);
            }
        }
    }

    /**
     * 修复收藏
     * @param  {$节点}	$it 	当前收藏Item
     * @param  {$节点}  	$a  	标题链接
     * @param  {数字}   	aid 	av号
     * @param  {字符串} 	title   标题
     * @param  {字符串} 	pic     海报
     * @param  {字符串} 	history 历史归档，若无时，使用空字符串
     */
    function fixFavorites($it, $a, aid, title, pic, history) {

        // 设置标题
        $a.text(title);
        $a.attr("title", $a.text());

        // 多个超链接
        const $as = $it.find("a");
        $as.attr("href", `https://www.biliplus.com/${history}video/av${aid}/`);

        signInval($it, $a);

        // 判断海报链接是否有效，有效时进行替换
        // cerenkov-fork 修改版把判断链接有效性的步骤注释掉，反正本来就没封面图，直接把biliplus返回的图片链接换上，就算链接无效，也不会变得更糟了
        // isLoad(pic, function() {
            const $img = $it.find("img");
            $img.attr("src", pic);
            $it.find("source").remove();  // cerenkov-fork BUGFIX: B站新界面把img元素放在picture元素内、与另两个source元素并列，Mr.Po原脚本没删掉source元素，导致浏览器优先显示source元素的无效封面图，而新替换上的封面图没显示出来
        // });
    }

    /**
     * 修复标题和海报
     * @param  {$节点}  $it 当前收藏Item
     * @param  {$节点}  $a  标题链接
     * @param  {数字}   aid av号
     */
    function fixTitleAndPic($it, $a, aid) {

        $a.text("Loading...");

        fixTitleAndPicEnhance3($it, $a, aid);
    }

    /**
     * 修复标题和海报 增强 - 0
     * 使用公开的API
     * @param  {$节点}   $it 当前收藏Item
     * @param  {$节点}   $a  标题链接
     * @param  {数字}    aid av号
     * @param  {布尔}    delayRetry 延迟重试
     */
    function fixTitleAndPicEnhance0($it, $a, aid, delayRetry) {

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com/api/view?id=${aid}`,
            responseType: "json",
            onload: function(response) {

                const res = response.response;

                if (isDebug) {
                    console.log("0---->：");
                    console.log(res);
                }

                // 找到了
                if (res.title) {

                    fixFavorites($it, $a, aid, res.title, res.pic, "");

                } else if (res.code == -503) { // 请求过快

                    retryLoad($a, aid, delayRetry, function() {
                        fixTitleAndPicEnhance0($it, $a, aid, true);
                    });

                } else { // 未找到

                    fixTitleAndPicEnhance1($it, $a, aid);
                }
            },
            onerror: function(e) {
                console.log("出错啦");
                console.log(e);
            }
        });
    }

    /**
     * 修复标题和海报 增强 - 1
     * 使用cache库
     * @param  {$节点}  $it 当前收藏Item
     * @param  {$节点}  $a  标题链接
     * @param  {数字}   aid av号
     */
    function fixTitleAndPicEnhance1($it, $a, aid) {

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com/all/video/av${aid}/`,
            onload: function(response) {

                if (isDebug) {
                    console.log("1---->：");
                    console.log(response.response);
                }

                const params = response.responseText.match(/getjson\('(\/api\/view_all.+)'/);

                fixTitleAndPicEnhance2($it, $a, aid, params[1]);
            }
        });
    }

    /**
     * 修复标题和海报 增强 - 2
     * 使用cache库，第一段，需与fixTitleAndPicEnhance1连用
     * @param  {$节点}  	$it 		当前收藏Item
     * @param  {$节点}  	$a  		标题链接
     * @param  {数字}   	aid 		av号
     * @param  {字符串} 	param 		待拼接参数
     * @param  {布尔}  	delayRetry	延迟重试
     */
    function fixTitleAndPicEnhance2($it, $a, aid, param, delayRetry) {

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com${param}`,
            responseType: "json",
            onload: function(response) {

                const res = response.response;

                if (isDebug) {
                    console.log("2---->：");
                    console.log(res);
                }

                // 找到了
                if (res.code === 0) {

                    fixFavorites($it, $a, aid, res.data.info.title, res.data.info.pic, "all/");

                } else if (res.code == -503) { // 请求过快

                    retryLoad($a, aid, delayRetry, function() {
                        fixTitleAndPicEnhance2($it, $a, aid, param, true);
                    });

                } else { // 未找到

                    $a.text(`已失效（${aid}）`);
                    $a.attr("title", $a.text());
                }
            }
        });
    }

    /**
     * 修复标题和海报 增强 - 3
     * 模拟常规查询
     * @param  {$节点}  	$it 当前收藏Item
     * @param  {$节点}  	$a  标题链接
     * @param  {数字}   	aid av号
     */
    function fixTitleAndPicEnhance3($it, $a, aid) {

        let jsonRegex;

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.biliplus.com/video/av${aid}/`,
            onload: function(response) {

                try {

                    if (isDebug) {
                        console.log("3---->：");
                        console.log(response.response);
                    }

                    jsonRegex = response.responseText.match(/window\.addEventListener\('DOMContentLoaded',function\(\){view\((.+)\);}\);/);

                    if (isDebug) {
                        console.log(jsonRegex);
                    }

                    const jsonStr = jsonRegex[1];

                    if (isDebug) {
                        console.log(jsonStr);
                    }

                    const res = $.parseJSON(jsonStr);

                    if (res.title) { // 存在

                        fixFavorites($it, $a, aid, res.title, res.pic, "");

                    } else if (res.code == -503) { // 请求过快

                        retryLoad($a, aid, null, function() {
                            fixTitleAndPicEnhance0($it, $a, aid, true);
                        });

                    } else { // 不存在

                        fixTitleAndPicEnhance1($it, $a, aid);
                    }

                } catch (err) {

                    console.error(err);
                    console.log(jsonRegex);

                    // 当出现错误时，出现手动加载
                    retryLoad($a, aid, null, function() {
                        fixTitleAndPicEnhance0($it, $a, aid, true);
                    });
                }
            }
        });
    }

    /**
     * 判断一个url是否可以访问
     * @param  {字符串}  url http地址
     * @param  {函数}  	fun 有效时的回调
     */
    function isLoad(url, fun) {
        $.ajax({
            url: url,
            type: 'GET',
            success: function(response) {
                fun();
            },
            error: function(e) {}
        });
    }

    /**
     * 显示详细
     * @param  {$节点} $lis 失效收藏节点集
     */
    function showDetail($lis) {

        const fidRegex = window.location.href.match(/fid=(\d+)/);

        let fid;

        if (fidRegex) {
            fid = fidRegex[1];
        } else {
            fid = $("div.fav-item.cur").attr("fid");
        }

        const pn = $("ul.be-pager li.be-pager-item.be-pager-item-active").text();

//        Mr.Po原脚本的过期失效端口
//        $.ajax({
//             url: `https://api.bilibili.com/medialist/gateway/base/spaceDetail?media_id=${fid}&pn=${pn}&ps=20&keyword=&order=mtime&type=0&tid=0&jsonp=jsonp`,
//            success: function(json) {

        GM_xmlhttpRequest({
            method: 'GET',
            url: `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${fid}&pn=${pn}&ps=20&keyword=&order=mtime&type=0&tid=0&platform=web`,
            responseType: "json",
            onload: function(response) {
                const json = response.response;

                const $medias = json.data.medias;

                $lis.each(function(i, it) {

                    const bv = $(it).attr("data-aid");

                    const $mediaF = $medias.filter(function(it) {
                        if (it.bvid == bv) {
                            return it;
                        }
                    });

                    const $media = $mediaF[0];

                    const $a = $(it).find("a");

                    let titles = "";

                    if ($media.pages) {

                        const $titlesM = $media.pages.map(function(it, i, arry) {
                            return it.title;
                        });

                        titles = $titlesM.join("、");
                    }

                    // const aid = bv2aid(bv);  // Mr.Po原脚本的bv2aid算法已经失效，函数 bv2aid 已更新为 bilibili-app-recommend 脚本所使用的算法，但这里直接用 $media.id 也一样，还更可靠

                    const content = `av：${$media.id}\nbv：${bv}\n标题：${$media.title}\nUP主：${$media.upper.name} （https://space.bilibili.com/${$media.upper.mid}）\n简介：${$media.intro}\n发布时间：${new Date($media.pubtime*1000).toLocaleString()}\nP数：${$media.page}\n子P：${titles}\n播放数：${$media.cnt_info.play}\n收藏数：${$media.cnt_info.collect}\n弹幕数：${$media.cnt_info.danmaku}`;  // cerenkov-fork 添加信息

                    $($a[0]).attr("title", content);

                    addCopyInfoButton($(it), content);

                    addOpenUpSpaceButton($(it), $media.upper.mid);  // cerenkov-fork 添加功能
                });
            }
        });
    }

    // Mr.Po原脚本的bv2aid算法已经失效，更新为 bilibili-app-recommend 脚本所使用的算法
    // 见 https://greasyfork.org/zh-CN/scripts/443530-bilibili-app-recommend
    // const bvTable = "fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF";
    // const bvArray = [
        // { bvIndex: 11, bvTimes: 1 },
        // { bvIndex: 10, bvTimes: 58 },
        // { bvIndex: 3, bvTimes: 3364 },
        // { bvIndex: 8, bvTimes: 195112 },
        // { bvIndex: 4, bvTimes: 11316496 },
        // { bvIndex: 6, bvTimes: 656356768 },
    // ];
    // const bvXor = 177451812;
    // const bvAdd = 8728348608;
    var XOR_CODE = 23442827791579n;
    var MASK_CODE = 2251799813685247n;
    var BASE = 58n;
    var CHAR_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

    // Mr.Po原脚本的bv2aid算法已经失效，更新为 bilibili-app-recommend 脚本所使用的算法
    // 见 https://greasyfork.org/zh-CN/scripts/443530-bilibili-app-recommend
    /**
     * BV号转aid
     * @param  {字符串}	bv BV号
     * @return {数字}	av号
     */
    // function bv2aid(bv) {
        // const value = bvArray
            // .map((it, i) => {
                // return bvTable.indexOf(bv[it.bvIndex]) * it.bvTimes;
            // })
            // .reduce((total, num) => {
                // return total + num;
            // });
        // return (value - bvAdd) ^ bvXor;
    // }
    function bv2aid(bvid) {
        const bvidArr = Array.from(bvid);
        [bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]];
        [bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]];
        bvidArr.splice(0, 3);
        const tmp = bvidArr.reduce((pre, bvidChar) => pre * BASE + BigInt(CHAR_TABLE.indexOf(bvidChar)), 0n);
        return Number(tmp & MASK_CODE ^ XOR_CODE);
    }

    function tip(text, iconName) {
        GM_notification({
            text: text,
            image: GM_getResourceURL(iconName)
        });
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

    setInterval(handleFavorites, space);
})();
