// ==UserScript==
// @name         哔哩哔哩(B站|Bilibili)收藏夹Fix (cerenkov修改版)
// @namespace    http://tampermonkey.net/
// @version      1.4.0
// @description  修复 哔哩哔哩(www.bilibili.com) 失效的视频收藏、和被up主隐藏的视频。（可查看av号、简介、标题、封面、数据等）
// @note         1.4.0版主要更新：
// @note         支持恢复被隐藏（up主“仅自己可见”）的视频信息，让收藏夹不再“缺一角”
// @note         支持同时查询 biliplus jijidown 以及 B站官方API，建议将收藏夹设为公开，可以恢复更多视频信息，事后再改回私密
// @note         查询结果缓存在篡改猴的本地存储，刷新标签页、关闭浏览器也不再丢失数据
// @author       cerenkov
// @license      GPL-3.0
// @match        *://space.bilibili.com/*/favlist*
// @require      https://cdnjs.cloudflare.com/ajax/libs/jquery/1.11.0/jquery.min.js
// @resource iconError https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/error.png
// @resource iconSuccess https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/success.png
// @resource iconInfo https://cdn.jsdelivr.net/gh/crnkv/bilibili-favorites-fix-cerenkov-mod/media/info.png
// @connect      biliplus.com
// @connect      jijidown.com
// @connect      api.bilibili.com
// @grant        GM.xmlHttpRequest
// @grant        GM_notification
// @grant        GM_setClipboard
// @grant        GM_getResourceURL
// @grant        GM_openInTab
// @grant        GM_listValues
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_setValues
// @grant        GM_getValues
// @grant        GM_deleteValues
// ==/UserScript==

/*jshint esversion: 8 */
(function() {
    'use strict';

    // 是否启用调试模式
    const isDebug = false;

    // 从监测到网页节点变动，到执行脚本修复之间的延迟（秒），延迟太短可能会导致收藏夹翻页的网页渲染未完成而脚本已经开始干预，造成意外后果
    const delay = 2.0;

    // 失效收藏的标题文字颜色(默认为灰色)。
    const invalTitleColor = "#999";
    // 被恢复的隐藏视频的背景颜色
    const recovItemColor = "#fa2";

    // 全局变量，用于保存是否B站新网页界面，脚本自动检测
    let isNewUI;
    // 全局变量，用于保存B新/旧界面各自的视频根节点，脚本自动检测
    let $rootItem;
    // 全局变量，用于保存由B站API端口查询得到的本应展示的视频总数（当中包含被隐藏的视频，即被up主设为“仅自己可见”的视频）
    let NTotalItems = undefined;
    // 全局变量，用于保存被成功恢复的隐藏视频
    let $recoveredItems = [];

    // 缓存已经查询过并且有结果的视频标题和封面（包括查到的和查不到的，不包括查询过程中请求过快、网络错误和解析错误的）
    let cache = {
        clear: function() {
            GM_deleteValues(GM_listValues());
        },
        delete: function(avid, key) {
            if (key == undefined) {
                GM_deleteValue(avid);  // cache.delete(avid) 删除一条缓存对象
            } else {
                let c = GM_getValue(avid, {});
                delete c[key];
                GM_setValue(avid, c);  // cache.delete(avid, key) 删除缓存对象的对应属性
            }
        },
        set: function(avid, key, value) {
            if (key == undefined) {
                value = avid;
                if (typeof value !== "object") throw "格式不正确";
                GM_setValues(value);  // cache.set(value) 把 value 对象内的所有项都覆盖保存到所有缓存
            } else if (value == undefined) {  // 注意永远不要故意传入value=undefined，应该要用delete方法
                value = key;
                if (typeof value !== "object") throw "格式不正确";
                GM_setValue(avid, value);  // cache.set(avid, value) 把 value 对象覆盖保存到对应缓存
            } else {
                if (key == "title")
                    value = $("<div/>").html(value).text();  // decode HTML entities
                let c = GM_getValue(avid, {});
                c[key] = value;
                GM_setValue(avid, c);  // cache.set(avid, key, value) 把 value 值覆盖保存到对应缓存的对应属性
            }
        },
        get: function(avid, key, defaultValue) {
            if (defaultValue == undefined) {  // 注意永远不要故意传入defaultValue=undefined
                switch (key) {
                    case "archive":
                        defaultValue = undefined; break;
                    case "title":
                    case "pic":
                    case "ff":
                        defaultValue = ""; break;
                    case "parts":
                        defaultValue = []; break;
                    case "tid":
                    case "thumb_up":
                    case "coin":
                    case "reply":
                        defaultValue = 0; break;
                    default:
                        // do nothing
                };
            }
            if (avid == undefined) {
                return GM_getValues(GM_listValues());  // cache.get() 返回所有缓存
            } else if (key == undefined) {
                return GM_getValue(avid, undefined);  // cache.get(avid) 返回一条缓存对象（未命中时返回 undefined ）
            } else {
                let v = GM_getValue(avid, {})[key];  // cache.get(avid, key) 返回对应缓存的对应属性（未命中时返回 switch-case 指定的 defaultValue ）
                return v == undefined ? defaultValue : v;  // cache.get(avid, key, defaultValue) 返回对应缓存的对应属性（未命中时返回 defaultValue ）
            }
        },
        update: function(avid, key, newValue) {
            let oldValue = this.get(avid, key);
            if (!newValue || newValue === oldValue) return oldValue;
            let isBetter = false;
            switch (key) {
                case "archive":
                    isBetter = (oldValue == undefined && newValue !== undefined) || (oldValue == "nohit" && (newValue == "bp" || newValue == "jj")) || (oldValue == "jj" && newValue == "bp");
                    break;
                case "title":
                    newValue = $("<div/>").html(newValue).text().trim();  // decode HTML entities
                    if (newValue == "" || newValue == "已失效视频" || newValue == avid) break;
                    isBetter = (oldValue == "" || oldValue == "已失效视频") || (oldValue.includes("视频投稿上传时的标题") && !newValue.includes("视频投稿上传时的标题"));
                    break;
                case "pic":
                    if (/bfs\/archive\/be27fd62c99036dce67efface486fb0a88ffed06/i.test(newValue)) break;
                    isBetter = (oldValue == "" && newValue !== "") || (!/bfs\/archive/i.test(oldValue) && /bfs\/archive/i.test(newValue));
                    break;
                case "parts":
                    isBetter = oldValue.length < 2 && newValue.length > 1;
                    break;
                case "tid":
                    isBetter = (!oldValue) && (!!newValue);
                    break;
                case "thumb_up":
                case "coin":
                case "reply":
                    isBetter = (!!newValue) && newValue > oldValue;
                    break;
                default:
                    // do nothing
            }
            if (isBetter) {
                this.set(avid, key, newValue);
                return newValue;
            } else {
                return oldValue;
            }
        },
        export: function() {
            return JSON.stringify(this.get());
        },
        import: function(str) {
            let json = JSON.parse(str);
            if (typeof json !== "object") {
                throw "JSON格式不正确";
            } else {
                for (let avid in json) {
                    if (typeof json[avid] !== "object")
                        throw "JSON格式不正确";
                    if (json[avid].success == true) {
                        json[avid].archive = "bp";
                    }
                    delete json[avid].success;
                }
            }
            this.clear();
            this.set(json);
        }
    };

    const categoriesArray = [["全部分区", 0], ["动画", 1], ["音乐", 3], ["游戏", 4], ["娱乐", 5], ["电视剧", 11], ["番剧", 13], ["单机游戏", 17], ["Mugen", 19], ["宅舞", 20], ["日常", 21], ["鬼畜调教", 22], ["电影", 23], ["MAD·AMV", 24], ["MMD·3D", 25], ["音MAD", 26], ["综合", 27], ["原创音乐", 28], ["音乐现场", 29], ["VOCALOID·UTAU", 30], ["翻唱", 31], ["完结动画", 32], ["连载动画", 33], ["完结剧集", 34], ["知识", 36], ["人文·历史", 37], ["演讲·公开课", 39], ["短片·手书", 47], ["资讯", 51], ["演奏", 59], ["网络游戏", 65], ["综艺", 71], ["动物综合", 75], ["美食制作", 76], ["其他国家", 83], ["小剧场", 85], ["特摄", 86], ["数码", 95], ["星海", 96], ["机械", 98], ["鬼畜", 119], ["GMV", 121], ["野生技术协会", 122], ["社科·法律·心理", 124], ["人力VOCALOID", 126], ["教程演示", 127], ["舞蹈", 129], ["音乐综合", 130], ["Korea相关", 131], ["音游", 136], ["明星综合", 137], ["搞笑", 138], ["欧美电影", 145], ["日本电影", 146], ["华语电影", 147], ["官方延伸", 152], ["国产动画", 153], ["舞蹈综合", 154], ["时尚", 155], ["舞蹈教程", 156], ["美妆护肤", 157], ["穿搭", 158], ["时尚潮流", 159], ["生活", 160], ["手工", 161], ["绘画", 162], ["运动", 163], ["健身", 164], ["广告", 165], ["国创", 167], ["国产原创相关", 168], ["布袋戏", 169], ["资讯", 170], ["电子竞技", 171], ["手机游戏", 172], ["桌游棋牌", 173], ["其他", 174], ["汽车生活", 176], ["纪录片", 177], ["科学·探索·自然", 178], ["军事", 179], ["社会·美食·旅行", 180], ["影视", 181], ["影视杂谈", 182], ["影视剪辑", 183], ["预告·资讯", 184], ["国产剧", 185], ["海外剧", 187], ["科技", 188], ["电脑装机", 189], ["摄影摄像", 190], ["影音智能", 191], ["风尚标", 192], ["MV", 193], ["电音", 194], ["动态漫·广播剧", 195], ["街舞", 198], ["明星舞蹈", 199], ["国风舞蹈", 200], ["科学科普", 201], ["资讯", 202], ["热点", 203], ["环球", 204], ["社会", 205], ["综合", 206], ["财经商业", 207], ["校园学习", 208], ["职业职场", 209], ["手办·模玩", 210], ["美食", 211], ["美食侦探", 212], ["美食测评", 213], ["田园美食", 214], ["美食记录", 215], ["鬼畜剧场", 216], ["动物圈", 217], ["喵星人", 218], ["汪星人", 219], ["动物二创", 220], ["野生动物", 221], ["小宠异宠", 222], ["汽车", 223], ["汽车文化", 224], ["汽车极客", 225], ["智能出行", 226], ["购车攻略", 227], ["人文历史", 228], ["设计·创意", 229], ["软件应用", 230], ["计算机技术", 231], ["科工机械", 232], ["极客DIY", 233], ["运动", 234], ["篮球", 235], ["竞技体育", 236], ["运动文化", 237], ["运动综合", 238], ["家居房产", 239], ["摩托车", 240], ["娱乐杂谈", 241], ["粉丝创作", 242], ["乐评盘点", 243], ["音乐教学", 244], ["赛车", 245], ["改装玩车", 246], ["新能源车", 247], ["房车", 248], ["足球", 249], ["出行", 250], ["三农", 251], ["仿妆cos", 252], ["动漫杂谈", 253], ["亲子", 254], ["手势·网红舞", 255], ["短片", 256], ["配音", 257], ["汽车知识科普", 258], ["版权内容", -24]];
    const categoriesDictReversed = Object.fromEntries(categoriesArray);
    const categoriesDict = Object.fromEntries(categoriesArray.map(x => x.reverse()));

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

    async function fetchJSON(url) {
        if (isDebug) console.log(`[bilibili-fav-fix] fetchJSON for ${url}`);
        let res = await GM.xmlHttpRequest({
            method: 'GET',
            url: url,
            responseType: "json"
        }).catch(e => {
            console.error(e);  // e里含有网络请求对象，res里不含
        });
        if (isDebug) console.log(res);
        if (!res) {
            tipError("收藏夹修复错误：bilibili、biliplus或jijidown的网站无法访问，可能需要检查网络连接并手动刷新重试");
            return null;
        } else if (res.status !== 200) {
            console.error(`[bilibili-fav-fix] network connection with status code ${res.status}: ${url}`);
            tipError("收藏夹修复错误：bilibili、biliplus或jijidown的网站无法访问，可能需要检查网络连接并手动刷新重试");
            return null;
        } else if (res.response == undefined) {
            console.error(`[bilibili-fav-fix] website not responding a JSON object: ${url}`);
            tipError("收藏夹修复错误：bilibili、biliplus或jijidown的网站返回的数据格式不正确");
            return null;
        } else {
            return res.response;
        }
    }


    // 脚本主入口
    function handleFavorites() {
        if (isDebug) console.log(`[bilibili-fav-fix] isNewUI: ${isNewUI}`);

        // 失效收藏节点集
        let $targetItems = [];
        let $allItems = [];
        if (isNewUI) {
            $allItems = $("div.fav-list-main div.items > div").toArray().map(item => $(item));
            $targetItems = $allItems.filter($item => $item.find(".bili-video-card__title a").first().text() == "已失效视频");
        } else if ($("ul.fav-video-list.content").length > 0) {
            $allItems = $("ul.fav-video-list.content li.small-item").toArray().map(item => $(item));
            $targetItems = $allItems.filter($item => $item.hasClass("disabled"));
        } else {
            console.error('[bilibili-fav-fix] B站网页样式无法识别');
        }

        if ($targetItems.length > 0 || NTotalItems == undefined || $allItems.length < NTotalItems) {
            if ($targetItems.length > 0)
                console.log(`[bilibili-fav-fix] ${$targetItems.length}个失效收藏待修复...`);
            if (NTotalItems == undefined) {
                if (isDebug) console.log(`[bilibili-fav-fix] 潜在可能有被隐藏的收藏待修复...`);
            } else if ($allItems.length < NTotalItems) {
                console.log(`[bilibili-fav-fix] ${NTotalItems - $allItems.length}个被隐藏的收藏待修复...`);
            }

            // 预处理 $allItems $targetItems 移除多余元素和样式 添加功能菜单
            $allItems.forEach(function($item) {
                setupItem($item);
            });
            $targetItems.forEach(function($item) {
                setupItem($item);
                $item.find("source").remove();
                if (!isNewUI) {
                    // 移除禁用样式
                    $item.removeClass("disabled");
                    $item.data("aElems").removeClass("disabled");
                }

                if (isDebug) console.log(`[bilibili-fav-fix] item needed to fix: ${$item.data("bvid")} ( ${$item.data("avid")} )`);
                // 功能菜单
                addCopyAVIDButton($item);
                addCopyBVIDButton($item);
                addCopyInfoButton($item);
                addOpenPicButton($item);
                addSaveLoadCacheButton($item);
                addDeleteThisButton($item);
                if (cache.get($item.data("avid"), "ff"))
                    addOpenFirstFrameButton($item);
            });

            startBilibiliApiQuery($targetItems, $allItems);

            // 分离已缓存条目和待查询条目
            let $queryItems = {};
            $targetItems.forEach(function($item) {
                const avid = $item.data("avid");
                let c = cache.get(avid);
                if (c && c.archive !== undefined) {  // c.archive 无论是 bp jj 还是 nohit ，都表明biliplus或jijidown的查询结果都已保存在cache中
                    $item.data("_query", "done");
                    if (c.archive == "bp") {
                        if ($item.data("_refineParts") == "needRefine") {
                            refineBiliplusQuery($item, avid);
                        } else {
                            $item.data("_refineParts", "canRefine");
                        }
                    }
                    queryCached($item, avid, c);  // TODO: 修复一种罕见的情况，如果biliplus网络故障，queryHit由jijidownQuery发起，导致没能检查pic的最优，cache中保存了较差的pic
                } else {  // 完全没查询过，或者只保存了biliAPI的查询结果，未缓存biliplus或jijidown的查询结果
                    $queryItems[avid] = $item;
                }
            });

            if (Object.keys($queryItems).length > 0)
                startBiliplusQuery($queryItems);
        }
    }


    async function startBiliplusQuery($queryItems) {
        let avids = Object.keys($queryItems);
        if (isDebug) console.log(`[bilibili-fav-fix] startBiliplusQuery for ${avids.length} items`);
        for (let [avid, $item] of Object.entries($queryItems)) {
            $item.data("titleElem").text("正在查询 biliplus ...");
        }
        const json = await fetchJSON(`https://www.biliplus.com/api/aidinfo?aid=${avids.join(',')}`);
        if (!json) {
            startJijidownQuery($queryItems, false);  // 由于网络请求遇到故障中断，姑且尝试jijidown，不代表biliplus上真的没数据
        } else if (json.code == -503) {
            // 请求过快，手动点击重试（optional延迟卡5秒）
            if (isDebug) console.log(`[bilibili-fav-fix] biliplus 请求过快 for ${avids.length} items`);
            for (let [avid, $item] of Object.entries($queryItems)) {
                const $titleElem = $item.data("titleElem");
                $titleElem.attr("href", "javascript:void(0);");
                $titleElem.attr("target", "_self");
                $titleElem.text("->请求过快，请点击手动加载<-");
                $titleElem.click(function() {
                    for (let [av, $it] of Object.entries($queryItems)) {
                        $it.data("titleElem").unbind("click");
                        $it.data("titleElem").attr("href", `https://www.bilibili.com/video/${$it.data("bvid")}`);
                        $it.data("titleElem").attr("target", "_blank");
                    }
                    startBiliplusQuery($queryItems);
                });
            }
        } else if (json.code !== 0) {  // json.code == -404 全无记录 -403 访问权限不足（up主隐藏）
            if (isDebug) console.log(`[bilibili-fav-fix] biliplus no results for ${avids.length} items`);
            startJijidownQuery($queryItems, true);
        } else {  // 至少部分avid有记录
            if (isDebug) console.log(`[bilibili-fav-fix] biliplus has ${Object.keys(json.data).length} hits`);
            for (let avid in json.data) {
                if (isDebug) console.log(`[bilibili-fav-fix] biliplus retrieved info for ${avid}`);
                let info = json.data[avid];
                let $item = $queryItems[avid];
                if ($item.data("_refineParts") == "needRefine") {
                    refineBiliplusQuery($item, avid);
                } else {
                    $item.data("_refineParts", "canRefine");
                }
                cache.update(avid, "archive", "bp");  // 视频确认存在于biliplus的archive中
                queryHit($item, avid, info.title, info.pic, `https://www.biliplus.com/video/av${avid}/`);
                if (!/bfs\/archive/i.test(info.pic)) {  // 极大概率是失效的旧图片链接
                    if (isDebug) console.log(`[bilibili-fav-fix] query for better pic for ${avid}`);
                    startJijidownQuery(Object.fromEntries([[avid, $item]]), false);  // 不能去再次update archive
                }
                delete $queryItems[avid];
            }
            if (Object.keys($queryItems).length > 0)
                startJijidownQuery($queryItems, true);
        }
    }


    async function refineBiliplusQuery($item, avid, retry) {
        if (isDebug) console.log(`[bilibili-fav-fix] refineBiliplusQuery for ${avid}`);
        const json = await fetchJSON(`https://www.biliplus.com/api/view?id=${avid}`);
        if (!json) {  // 网络连接故障中断或JSON格式错误
            return;
        } else if (json.code == -503) {  // 请求过快
            if (retry == undefined)
                // 主要是不想将已经修复好显示好的标题又改成 "->请求过快，请点击手动加载<-"，没必要，反正只要parts未查询、记录进cache，刷新页面后还会再发起查询的
                if (isDebug) console.log(`[bilibili-fav-fix] refineBiliplusQuery 请求过快，10秒后重试`);
                setTimeout(refineBiliplusQuery, 10000, $item, avid, 1);
            return;
        } else if (json.code == -404) {  // 查询无结果
            return;
        } else if (json.code == -403) {  // 访问权限不足（up主隐藏）
            return;
        } else if (json.list && json.list.length > 1) {
            if (isDebug) console.log(`[bilibili-fav-fix] refined biliplus gets ${json.list.length} parts for ${avid}`);
            let parts = json.list.map(x => x.part);
            parts = cache.update(avid, "parts", parts);
            let partsStr = parts.map(part => `* ${part}\n`).join('');
            replaceTooltip($item, "播放数：", `子P标题：\n${partsStr}播放数：`);
        }
        // 下面这几个就不实时更新到浮块里了，没啥重要的
        if (json.tid) cache.update(avid, "tid", json.tid);
        if (json.coins) cache.update(avid, "coin", json.coins);
        if (json.review) cache.update(avid, "reply", json.review);
        if (json.v2_app_api && json.v2_app_api.first_frame) {
            let ff = json.v2_app_api.first_frame;
            if (isDebug) console.log(`[bilibili-fav-fix] first_frame pic found for ${avid}: ${ff}`);
            cache.set(avid, "ff", ff);
            addOpenFirstFrameButton($item);
        }
    }


    function startJijidownQuery($queryItems, biliplusTried) {
        if (isDebug) console.log(`[bilibili-fav-fix] startJijidownQuery for ${Object.keys($queryItems).length} items`);
        for (let avid in $queryItems) {  // 并发网络请求 for 循环
            if (isDebug) console.log(`[bilibili-fav-fix] startJijidownQuery for ${avid}`);
            $queryItems[avid].data("titleElem").text("正在查询 jijidown ...");
            fetchJSON(`https://www.jijidown.com/api/v1/video/get_info?id=${avid}`)
                .then(json => {
                    if (!json) {
                        // 不update archive nohit，因为网络请求遇到故障中断并不意味着biliplus或jijidown上无archive
                        queryFailed($queryItems[avid], avid);
                    } else if (json.code == 0 || json.upid == undefined) {
                        if (isDebug) console.log(`[bilibili-fav-fix] jijidown 请求过快 ${avid} 2秒后重试`);
                        setTimeout(startJijidownQuery, 2000, Object.fromEntries([[avid, $queryItems[avid]]]), biliplusTried);
                    } else if (json.upid == -1 || json.upid == 0 || json.title == "视频去哪了呢？" || json.title == "该视频或许已经被删除了" || (json.title == avid && json.img == "")) {
                        if (isDebug) console.log(`[bilibili-fav-fix] jijidown failed for ${avid}`);
                        // 仅当biliplus确实确认无archive，而jijidown又查询不到时，本次查询结果是nohit（有可能曾经存在过）
                        if (biliplusTried) cache.update(avid, "archive", "nohit");  // 视频确认 不 存在于biliplus或jijidown的archive中
                        queryFailed($queryItems[avid], avid);
                    } else {
                        if (isDebug) console.log(`[bilibili-fav-fix] jijidown retrieved info for ${avid}`);
                        cache.update(avid, "archive", "jj");  // 视频确认存在于jijidown的archive中
                        queryHit($queryItems[avid], avid, json.title, json.img, `https://www.jijidown.com/api/v1/video/get_info?id=${avid}`);  // 默认假设jijidown缓存发生在投稿未失效之前，不会发生title为空而子P title非空
                    }
                });
        }
    }


    function queryHit($item, avid, title, pic, url) {
        if (isDebug) console.log(`[bilibili-fav-fix] queryHit for ${avid}`);
        // 录入缓存
        if (title && title !== "已失效视频" && title !== avid) {  // 规避掉查询返回的JSON title意外undefined的问题
            cache.set(avid, "title", title);  // 默认假设biliplus或jijidown返回的title更好，即便biliAPI也返回了title，但它是从子P猜测得来的
        } else {
            title = cache.get(avid, "title");
        }
        if (pic && /bfs\/archive/i.test(pic)) {
            cache.set(avid, "pic", pic);  // 比B站API的pic更可靠，即使两个都是bfs/archive
        } else {
            pic = cache.update(avid, "pic", pic);
        }
        $item.data("_query", "done");
        // 设置超链接、设置标题文字和样式、替换封面
        if (url) setCoverLink($item, url);
        setTitleText($item, title, true);
        if (pic) $item.data("imgElem").attr("src", pic);
        // 替换浮块
        if ($item.data("_biliAPI" == "done"))  // biliAPI 先构建了浮块，biliplus或jijidown后更新title和pic和parts
            replaceTooltip($item, /\n标题：.*\n/, `\n标题：${title}\n`);
    }


    function queryFailed($item, avid) {
        if (isDebug) console.log(`[bilibili-fav-fix] queryFailed for ${avid}`);
        $item.data("_query", "done");
        let c = cache.get(avid);
        queryCached($item, avid, c);
    }


    function queryCached($item, avid, c) {
        if (isDebug) console.log(`[bilibili-fav-fix] queryCached for ${avid}`);
        // 设置超链接、设置标题文字和样式、替换封面
        if (c.archive == "bp") {
            setCoverLink($item, `https://www.biliplus.com/video/av${avid}/`);
        } else if (c.archive == "jj") {
            setCoverLink($item, `https://www.jijidown.com/api/v1/video/get_info?id=${avid}`);
        }
        if (c.title) {  // 有缓存title则先显示，可能会被biliAPI之后修改
            setTitleText($item, c.title, true);  // 仅当成功恢复时修改样式
        } else if ($item.data("_biliAPI" == "done")) {  // 没有缓存，biliAPI也没有
            setTitleText($item, `查不到标题（${avid}）`, false);
        } else {  // 没有缓存，但biliAPI之后可能有
            setTitleText($item, `正在查询 bilibili API ...`, false);
        }
        if (c.pic)
            $item.data("imgElem").attr("src", c.pic);
    }


    async function startBilibiliApiQuery($targetItems, $allItems) {
        if (isDebug) console.log(`[bilibili-fav-fix] startBilibiliApiQuery for ${$targetItems.length} targetItems, ${$allItems.length} allItems and ${NTotalItems} totalItems`);
        let apiType;
        if (isNewUI) {
            apiType = $("div.favlist-info-detail .status").text().trim();
        } else {
            apiType = $("div.favInfo-details > div:nth-child(3) > span:nth-child(3)").text().trim();
        }
        if (apiType == "公开") {
            apiType = "public";
        } else if (apiType == "私密") {
            apiType = "private";
        } else {
            apiType = "public";  // 例如旧UI等未能一一适配的情况，先从 public 开始尝试
        }

        let fid = window.location.href.match(/fid=(\d+)/i);
        if (fid) {
            fid = fid[1];
        } else if (isNewUI) {
            fid = $("div.fav-sidebar-item:has(.vui_sidebar-item--active)").first().attr("id");
        } else {
            fid = $("li.fav-item.cur").first().attr("fid");
        }
        if (!fid) {
            let json = await fetchJSON(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${mid}`);
            if (!json) return;
            fid = json.data.list[0].id;
        }

        let json = await fetchJSON(getBilibiliApiUrl(fid, apiType, 1));
        if (!json) return;

        if (json.code !== 0) {
            if (apiType == "public") {
                console.warn(`[bilibili-fav-fix] bilibili public API failed, now use private API`);
                apiType = "private";
                json = await fetchJSON(getBilibiliApiUrl(fid, apiType, 1));
                if (!json) return;
            }
            if (json.code !== 0) {
                console.warn(`[bilibili-fav-fix] bilibili private API failed`);
                $targetItems.forEach(function($item) {
                    $item.data("_biliAPI", "done");  // biliAPI 未能成功获取任何信息，但确实done了
                    // 不生成浮块，也不设置标题和封面，留给 queryHit queryFailed queryCached 去完成
                });
                return;
            }
        }

        // 旧的对公开收藏夹的访问API只接受最多数值20的ps参数，与B站新UI渲染时的一页40个视频不相符，需要分成两个part的网络请求来查询
        if (isNewUI && apiType == "public") {
            let json2 = await fetchJSON(getBilibiliApiUrl(fid, apiType, 2));
            if (!json2) return;
            if (json2.data?.medias) {
                // .medias可以undefined，但如果json2有，那么json也有
                for (let i = 0; i < json2.data.medias.length; i++) {
                    json.data.medias[i+20] = json2.data.medias[i];
                }
            }
        }

        const medias = json?.data?.medias || [];  // .medias可以undefined
        NTotalItems = medias.length;
        if (isDebug) console.log(`[bilibili-fav-fix] ${NTotalItems} items in total, ${$allItems.length} items visible`);

        if (apiType == "public" && $allItems.length < NTotalItems)
            recoverHiddenItems($allItems, medias, $targetItems);

        // showDetails($targetItems, medias)
        $targetItems.forEach(function($item) {
            const bvid = $item.data("bvid");
            if (isDebug) console.log(`[bilibili-fav-fix] showDetails: ${bvid} (${bv2av(bvid)})`);

            let media = medias.filter(m => m.bvid == bvid);
            if (media.length > 0) {
                media = media[0];
                if (isDebug) console.log(media);
            } else {
                console.error(`[bilibili-fav-fix] ${bvid} not found in Bilibili API JSON (wrong params?): ${getBilibiliApiUrl(fid, apiType, 1)}`);
                return;
            }

            const avid = media.id;
            let title = "";
            if (media.title !== "" && media.title !== "已失效视频")
                title = media.title;  // 从 title key 读取
            if (!title && media.page == 1 && media.pages && media.pages.length == 1 && media.pages[0].title !== "" && media.pages[0].title !== "已失效视频")
                title = media.pages[0].title + " （视频投稿上传时的标题）";  // 从分P 的第一P title key 读取
            title = cache.update(avid, "title", title);

            let parts = [];
            if (media.page > 1 && media.pages && media.pages.length > 1)
                parts = media.pages.map(page => page.title).filter(p => p !== "" && p !== "已失效视频");  // 从分P 信息的 title key 读取
            parts = cache.update(avid, "parts", parts);
            if (media.page == 0 || (media.page > 1 && parts.length < 2)) {
                if ($item.data("_refineParts") == "canRefine") {
                    refineBiliplusQuery($item, avid);
                } else {
                    $item.data("_refineParts", "needRefine");
                }
            }

            media.tid = cache.update(avid, "tid", media.tid);
            media.cnt_info.thumb_up = cache.update(avid, "thumb_up", media.cnt_info.thumb_up);
            media.cnt_info.coin = cache.update(avid, "coin", media.cnt_info.coin);
            media.cnt_info.reply = cache.update(avid, "reply", media.cnt_info.reply);

            $item.data("_biliAPI", "done");  // biliAPI所获取数据已存入cache完成

            // biliplus或jijidown先设置了标题（可能是hit failed或cached），biliAPI后更新标题
            if ($item.data("_query") == "done") {
                if (title) {
                    setTitleText($item, title, true);  // 仅当成功恢复时有样式
                } else {
                    setTitleText($item, `查不到标题（${avid}）`, false);
                }
            }

            let tips = $item.data("_tips") ? $item.data("_tips") : "（提示：尽量将收藏夹设为公开，这样能恢复更多的视频标题和分P。可以等脚本将信息自动缓存到本地后，再改回去私密收藏夹也不迟，此时依然能看到缓存好的视频修复标题）";
            setTooltip($item, media, title, parts, tips);

            addOpenUpSpaceButton($item, media.upper.mid);
        });
    }


    function recoverHiddenItems($allItems, medias, $targetItems) {
        if (isDebug) console.log(`[bilibili-fav-fix] recovering ${NTotalItems - $allItems.length} hidden items`);
        let allBvids = $allItems.map($item => $item.data("bvid"));

        for (let i = 0; i < NTotalItems; i++) {
            let media = medias[i];
            if (allBvids.includes(media.bvid)) continue;

            if (isDebug) console.log(`[bilibili-fav-fix] recover hidden item: ${media.bvid} (${media.id})`);
            let duration = new Date(media.duration * 1000).toISOString().slice(11, 19);
            if (duration.slice(0, 2) == "00") duration = duration.slice(3);
            let favdate = new Date(media.fav_time * 1000).toLocaleDateString().replaceAll('/', '-');
            let pubdate = new Date(media.pubtime * 1000).toLocaleDateString().replaceAll('/', '-');

            // 构造新$item
            let $item;
            if (isNewUI) {
                $item = $(
`<div class="items__item">
  <div class="bili-video-card">
    <div class="bili-video-card__wrap">
      <div class="bili-video-card__cover">
        <a class="bili-cover-card" href="javascript:void(0);" target="_self"><div class="bili-cover-card__thumbnail"><img src="${media.cover}"></div><div class="bili-cover-card__stats"><div class="bili-cover-card__stat"><i class="sic-BDC-playdata_square_line"></i><span>${media.cnt_info.view_text_1}</span></div><div class="bili-cover-card__stat"><i class="sic-BDC-danmu_square_line"></i><span>${media.cnt_info.danmaku}</span></div><div class="bili-cover-card__stat"><span>${duration}</span></div></div></a>
        <div class="bili-card-watch-later"><div class="bili-card-watch-later__btn"><i class="sic-BDC-arrow_play_next_line" style="font-variation-settings:'strk' 1.5"></i></div><span class="bili-card-watch-later__tip">稍后再看</span></div>
        <div class="bili-card-checkbox"><div class="bili-card-checkbox__inner"></div></div>
      </div>
      <div class="bili-video-card__details">
        <div class="bili-video-card__title bili-video-card__title--pr"><a href="https://www.bilibili.com/video/${media.bvid}" target="_blank">${""}</a><div class="bili-card-dropdown"><i class="sic-BDC-more_vertical_fill" style="font-variation-settings:'strk' 1.5"></i></div></div>
        <div class="bili-video-card__subtitle"><a class="bili-video-card__author" href="https://space.bilibili.com/${media.upper.mid}" target="_blank"><div class="bili-video-card__text"><i class="sic-BDC-uploader_name_square_line"></i><span></span></div><div class="bili-video-card__text"><span title="${media.upper.name} · 收藏于${favdate}">${media.upper.name} · 收藏于${favdate}</span></div></a></div>
      </div>
    </div>
  </div>
</div>`);
            } else {
                $item = $(
`<li data-aid="${media.bvid}" class="small-item">
  <a href="javascript:void(0);" target="_self" class="cover cover-normal">
    <img src="${media.cover}" alt="${""}" class="cover-img">
    <span class="length">${duration}</span>
    <span class="i-watchlater"></span>
    <div class="meta-mask"><div class="meta-info"><p class="view">播放：${media.cnt_info.view_text_1}</p><p class="favorite">收藏：${media.cnt_info.collect}</p><p class="author">UP主：${media.upper.name}</p><p class="pubdate">投稿：${pubdate}</p></div></div>
    <div class="disabled-cover"><div class="candle"></div><p>视频已失效</p></div>
  </a>
  <a target="_blank" href="https://www.bilibili.com/video/${media.bvid}/" title="${""}" class="title">${""}</a>
  <div class="meta pubdate">收藏于： ${favdate}</div>
  <div class="be-dropdown video-edit">
    <div class="be-dropdown-trigger"><i title="更多操作" class="iconfont icon-ic_more"></i></div>
    <ul class="be-dropdown-menu menu-align-" style="left: 0px; top: 0px; transform-origin: center top 0px; display: none;"><li class="be-dropdown-item be-dropdown-item-delimiter">取消收藏</li><li class="be-dropdown-item">移动到</li><li class="be-dropdown-item">复制到</li></ul>
  </div>
  <div class="video-check-container" style="display: none;"><div class="video-check icon"></div></div>
</li>`);
            }
            setupItem($item);
            setTitleText($item, media.title, false);  // 防止字符转义，在这里插入media.title
            $item.attr("style", `border: 0; background-color:${recovItemColor}; box-shadow: 0 2px 30px ${recovItemColor}, 0 -2px 30px ${recovItemColor}, -2px 0 30px ${recovItemColor}, 2px 0 30px ${recovItemColor};`);

            // 点击封面复制稿件信息
            $item.data("coverElem").click(function() {
                GM_setClipboard($item.data("coverElem").attr("title"), "text");
                tipSuccess("稿件信息复制成功！");
            });

            let tips = "（提示：请点击封面从而复制视频信息。这种是被隐藏的视频，即被up主设置为“仅自己可见”的视频，常表现为“收藏夹缺了一格”，不同于被B站删除/退回的失效视频。只有在公开收藏夹中时，脚本才能将其恢复出来）";
            if (media.title !== "已失效视频" && media.title !== "" && media.pages) {
                setTooltip($item, media, media.title, media.pages.map(page => page.title), tips);
            } else {
                // 如果同时既是被up主隐藏，也是被B站删除/退回的话
                let avid = media.id;
                let c = cache.get(avid);
                if (c && c.archive !== undefined) {
                    $item.data("_query", "done");
                    if (c.archive == "bp") {
                        if ($item.data("_refineParts") == "needRefine") {
                            refineBiliplusQuery($item, avid);
                        } else {
                            $item.data("_refineParts", "canRefine");
                        }
                    }
                    queryCached($item, avid, c);
                } else {
                    startBiliplusQuery(Object.fromEntries([[avid, $item]]));
                }
                $item.data("_tips", tips);
                $targetItems.push($item);
            }

            $recoveredItems.push($item);
            // 将$item插入到网页
            observer.disconnect();
            if ($allItems.length == 0) {
                $item.appendTo($rootItem);
                $rootItem.show();
                if (isNewUI) {
                    $("div.fav-list-main-empty").hide();
                } else {
                    $("div.search-empty-hint").hide();
                }
            } else {
                if (i == 0) {
                    $item.insertBefore($allItems[0]);
                } else {
                    $item.insertAfter($allItems[i-1]);
                }
            }
            observer.observe($rootItem[0], observerOptions);
            $allItems.splice(i, 0, $item)
        }
    }


    function setTooltip($item, media, title, parts, tips = "") {
        if (isDebug) console.log(`[bilibili-fav-fix] setTooltip for ${title}`);
        let partsStr = parts.map(part => `* ${part}\n`).join('');
        let category = categoriesDict[media.tid];
        let duration = new Date(media.duration * 1000).toISOString().slice(11, 19);
        if (duration.slice(0, 2) == "00") duration = duration.slice(3);
        let reason = "";
        if (media.attr !== undefined) {
            if (media.attr == 0) {
                reason = "未失效(0)";
            } else if (media.attr == 9) {
                reason = "UP主自己删除(9)";
            } else if (media.attr == 1) {
                reason = "其他原因删除/退回(1)";
            } else {
                reason = `原因编号意义未明(${media.attr})`;
            }
        }

        let tooltip = 
`AV号：${media.id}
BV号：${media.bvid}
标题：${title}
UP主：${media.upper.name} （https://space.bilibili.com/${media.upper.mid}）
简介：${media.intro}
分区：${category}
时长：${duration}
发布时间：${new Date(media.pubtime * 1000).toLocaleString()}
收藏时间：${new Date(media.fav_time * 1000).toLocaleString()}
${media.page > 1 ? `分P数量：${media.page}\n` : ""}${partsStr ? `子P标题：\n${partsStr}` : ""}播放数：${media.cnt_info.play}
收藏数：${media.cnt_info.collect}
弹幕数：${media.cnt_info.danmaku}
${media.cnt_info.thumb_up !== 0 ? `点赞数：${media.cnt_info.thumb_up}\n` : ""}${media.cnt_info.coin !== 0 ? `投币数：${media.cnt_info.coin}\n` : ""}${media.cnt_info.reply !== 0 ? `回复数：${media.cnt_info.reply}\n` : "" }${reason ? `失效原因：${reason}` : ""}
${tips}`;
        $item.data("coverElem").attr("title", tooltip);
    }


    function getBilibiliApiUrl(fid, apiType, fetchPart) {
        if (isDebug) console.log(
`[bilibili-fav-fix] getBilibiliApiUrl
[bilibili-fav-fix] fid: ${fid}
[bilibili-fav-fix] apiType: ${apiType}
[bilibili-fav-fix] fetchPart: ${fetchPart}`);

        let pn, order, tid;
        if (isNewUI) {
            pn = $("div.vui_pagenation--btns .vui_button.vui_button--active").text().trim();
            order = $("div.fav-list-header-filter__left div.radio-filter__item--active").first().text().trim();
            tid = $("div.fav-list-header-collapse div.radio-filter__item--active").first().text().trim().replace(/\s+\d+/, "");
        } else {
            pn = $("ul.be-pager li.be-pager-item.be-pager-item-active").text().trim();
            order = $("div.fav-filters > div.be-dropdown.filter-item > span").first().text().trim();
            tid = $("div.fav-filters > div:nth-child(2) > span").first().text().trim();  // 能够选择分区的旧UI似乎已经调不出来了，试过各种老UA都不行
        }
        if (!pn) pn = 1;
        order = Object.fromEntries([["最近收藏", "mtime"], ["最多播放", "view"], ["最新投稿", "pubtime"], ["最近投稿", "pubtime"]])[order];
        if (order === undefined) order = "mtime";    // 执行收藏夹搜索时无从得知排序，只能手动指定成“最近收藏”，不保证结果正确
        tid = categoriesDictReversed[tid];
        if (tid === undefined) tid = 0;    // 一些被下线和撤除的分区，无从得知其名称和tid，只能手动指定成“全部分区”，返回的结果很大概率不包含目标视频的数据
        if (isDebug) console.log(
`[bilibili-fav-fix] pn: ${pn}
[bilibili-fav-fix] order: ${order}
[bilibili-fav-fix] tid: ${tid}`);

        let searchType = 0;
        let keyword = "";
        if (isNewUI) {
            if ($("div.fav-list-header-filter__desc").length > 0) {
                searchType = $("div.fav-list-header-filter__right button").first().text().trim();
                searchType = Object.fromEntries([["当前", 0], ["全部", 1]])[searchType];
                keyword = encodeURIComponent($("div.fav-list-header-filter__right input").first().val());
            }
        } else {
            if ($("div.search-results-num").length > 0) {
                searchType = $("div.search-types > div.be-dropdown > div").first().text().trim();
                searchType = Object.fromEntries([["当前", 0], ["全部", 1]])[searchType];
                keyword = encodeURIComponent($("input.search-fav-input").first().val());
            }
        }
        if (searchType == undefined) searchType = 0;
        if (isDebug) console.log(
`[bilibili-fav-fix] searchType: ${searchType}
[bilibili-fav-fix] keyword: ${keyword}`);

        if (apiType == "public") {
            if (isNewUI) {
                return `https://api.bilibili.com/medialist/gateway/base/spaceDetail?media_id=${fid}&pn=${pn*2-1+fetchPart-1}&ps=20&keyword=${keyword}&order=${order}&type=${searchType}&tid=${tid}&jsonp=jsonp`;
            } else {
                return `https://api.bilibili.com/medialist/gateway/base/spaceDetail?media_id=${fid}&pn=${pn}&ps=20&keyword=${keyword}&order=${order}&type=${searchType}&tid=${tid}&jsonp=jsonp`;
            }
        } else if (apiType == "private") {
            return `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${fid}&pn=${pn}&ps=${isNewUI ? 40 : 20}&keyword=${keyword}&order=${order}&type=${searchType}&tid=${tid}&platform=web`;
        }
    }


    function setupItem($item) {
        let bvid, avid;
        let $aElems = $item.find("a:not(.bili-video-card__author)");
        $item.data("aElems", $aElems);
        $item.data("coverElem", $($aElems[0]));
        $item.data("titleElem", $($aElems[1]));
        $item.data("imgElem", $($aElems[0]).find("img"));
        if (isNewUI) {
            bvid = $item.data("titleElem").attr("href").match(/bilibili\.com\/video\/(\w+)/i)[1];
            $item.data("subtitleElem", $item.find("div.bili-video-card__subtitle"));
        } else {
            bvid = $item.attr("data-aid");
            $item.data("subtitleElem", $item.find("div.meta.pubdate"));
        }
        avid = bv2av(bvid);
        $item.data("bvid", bvid);
        $item.data("avid", avid);
    }

    function setCoverLink($item, url) {
        const $coverElem = $item.data("coverElem");
        $coverElem.attr("href", url);
        $coverElem.attr("target", "_blank");
    }

    function setTitleText($item, title, markStrike) {
        const $titleElem = $item.data("titleElem");
        $titleElem.text(title);
        $titleElem.attr("title", title);
        if (markStrike) {
            // 增加 删除线 + 置(灰)
            $titleElem.attr("style", `text-decoration: line-through; color:${invalTitleColor};`);
            // 收藏时间 + UP主（新UI） 增加 删除线
            $item.data("subtitleElem").attr("style", "text-decoration:line-through");
        }
    }

    function replaceTooltip($item, from, to) {
        const $coverElem = $item.data("coverElem");
        let tooltip = $coverElem.attr("title");
        if (tooltip) {
            tooltip = tooltip.replace(from, to);
            $coverElem.attr("title", tooltip);
        }
    }

    function addCopyAVIDButton($item) {
        addButton($item, "复制AV号", function() {
            GM_setClipboard($item.data("avid"), "text");
            tipSuccess("AV号复制成功！");
        });
    }

    function addCopyBVIDButton($item) {
        addButton($item, "复制BV号", function() {
            GM_setClipboard($item.data("bvid"), "text");
            tipSuccess("BV号复制成功！");
        });
    }

    function addCopyInfoButton($item) {
        addButton($item, "复制稿件信息", function() {
            GM_setClipboard($item.data("coverElem").attr("title"), "text");
            tipSuccess("稿件信息复制成功！");
        });
    }

    function addOpenUpSpaceButton($item, mid) {
        addButton($item, "跳转UP主空间", function() {
            GM_openInTab(`https://space.bilibili.com/${mid}`, {active: true, insert: true, setParent: true});
        });
    }

    function addOpenPicButton($item) {
        addButton($item, "查看封面图片", function() {
            GM_openInTab($item.data("imgElem").attr("src"), {active: true, insert: true, setParent: true});
        });
    }

    function addOpenFirstFrameButton($item) {
        addButton($item, "查看首帧截图", function() {
            GM_openInTab(cache.get($item.data("avid"), "ff"), {active: true, insert: true, setParent: true});
        });
    }

    function addDeleteThisButton($item) {
        addButton($item, "删除本条缓存", function() {
            cache.delete($item.data("avid"));
            tipSuccess("本视频缓存删除成功！");
        });
    }

    function addSaveLoadCacheButton($item) {
        addButton($item, "导出/导入缓存", function () {
            if (unsafeWindow.confirm("【导出】点击确定，即可将查询到的标题/封面/分P缓存数据导出至剪贴板；点击取消，可粘贴导入缓存数据")) {
                GM_setClipboard(cache.export(), "text");
                tipSuccess("缓存导出至剪贴板成功！");
            } else {
                let input = unsafeWindow.prompt("【导入】粘贴输入缓存数据，即可导入（注意：错误格式的数据可能会导入成功但脚本运行出错且难以恢复）");
                if (input) {
                    try {
                        cache.import(input);
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
            const $dropdownMenu = $item.find(".be-dropdown-menu").first();
            if (! ($dropdownMenu.find(".bili-fav-fix-menu-item").text().includes(name)) ) {
                const $lastChild = $dropdownMenu.children().last();
                // 未添加过扩展
                if (!$lastChild.hasClass('bili-fav-fix-menu-item'))
                    $lastChild.addClass("be-dropdown-item-delimiter");

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


    // 用mutation observer监测根节点的变动，适当延时后执行主脚本
    const observerOptions = { attributes: false, childList: true, subtree: false };
    const observer = new MutationObserver(mutationList => {
        if (isDebug) console.log(`[bilibili-fav-fix] 检测到根节点变化，开始执行修复`);
        if (isDebug) console.log(mutationList);
        observer.disconnect();
        $recoveredItems.forEach(function($item) {
            $item.remove();
        });
        $recoveredItems = [];
        NTotalItems = undefined;
        setTimeout(function() {
            observer.observe($rootItem[0], observerOptions);
            handleFavorites();
        }, delay * 1000);
    });
    // 初始化全局变量，及首次激活observer
    const intervalID = setInterval(function() {
        if ($("div.fav-list-main div.items").length > 0) {
            if (isDebug) console.log(`[bilibili-fav-fix] 检测到B站新UI加载完成`);
            isNewUI = true;
            $rootItem = $("div.fav-list-main div.items");
            clearInterval(intervalID);
            setTimeout(function() {
                observer.observe($rootItem[0], observerOptions);
                handleFavorites();
            }, 3000);
        } else if ($("ul.fav-video-list.content").length > 0) {
            if (isDebug) console.log(`[bilibili-fav-fix] 检测到B站旧UI加载完成`);
            isNewUI = false;
            $rootItem = $("ul.fav-video-list.content");
            clearInterval(intervalID);
            setTimeout(function() {
                observer.observe($rootItem[0], observerOptions);
                handleFavorites();
            }, 3000);
        }
    }, 1000);
})();