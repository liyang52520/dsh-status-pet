# Artwork catalog (FROZEN)

Produced by `python3 tools/gen-artwork.py` from `tools/gif-map.json` and
`assets/*.gif` — BOTH OF WHICH HAVE SINCE BEEN DELETED from this repo, so this
catalog can no longer be regenerated and is kept as the RECORD of what the
built-in actions are.  The data itself lives in `src/artwork.gen.ts`.

Every row is one LIBRARY ENTRY — an action the artwork owns.  The id is
what a state references, so one action can serve several states.

| state | id | take | gif | frame indices | meaning |
|---|---|---|---|---|---|
| `idle` | `daiji-huxi-xiuxian` | 01/61 | `daiji-huxi-xiuxian.gif` | 0,30,60,90 | 待机呼吸循环 |
| `idle` | `lanjing-xianshi` | 02/61 | `lanjing-xianshi.gif` | 0,30,60,90 | 蓝鲸出场 |
| `idle` | `jingyu-tu-paopao-texiao` | 03/61 | `jingyu-tu-paopao-texiao.gif` | 0,30,60,90 | 吐泡泡特效 |
| `idle` | `chenjian-shuaya` | 04/61 | `chenjian-shuaya.gif` | 0,30,60,90 | 晨间刷牙 |
| `idle` | `chaoda-shenlanyao` | 05/61 | `chaoda-shenlanyao.gif` | 0,30,60,90 | 喝超大杯药水 ? |
| `idle` | `chou-tuoluo` | 06/61 | `chou-tuoluo.gif` | 0,30,60,90 | 抽陀螺 |
| `idle` | `dangqiuqian` | 07/61 | `dangqiuqian.gif` | 0,30,60,90 | 荡秋千 |
| `idle` | `duixueren` | 08/61 | `duixueren.gif` | 0,30,60,90 | 堆雪人 |
| `idle` | `zhao-jingzi` | 09/61 | `zhao-jingzi.gif` | 0,30,60,90 | 照镜子 |
| `idle` | `lu-mao` | 10/61 | `lu-mao.gif` | 0,30,60,90 | 撸猫 |
| `idle` | `youya-nvpuwu` | 11/61 | `youya-nvpuwu.gif` | 0,30,60,90 | 优雅女仆舞 |
| `idle` | `nvpu-quxi-liyi` | 12/61 | `nvpu-quxi-liyi.gif` | 0,30,60,90 | 女仆屈膝礼 |
| `idle` | `qi-muma` | 13/61 | `qi-muma.gif` | 0,30,60,90 | 骑木马 |
| `idle` | `ti-jianzi` | 14/61 | `ti-jianzi.gif` | 0,30,60,90 | 踢毽子 |
| `idle` | `pangxie-zoulu` | 15/61 | `pangxie-zoulu.gif` | 0,30,60,90 | 螃蟹走路 |
| `idle` | `puke-moshu` | 16/61 | `puke-moshu.gif` | 0,30,60,90 | 扑克魔术 |
| `idle` | `xiawuziqi` | 17/61 | `xiawuziqi.gif` | 0,30,60,90 | 下五子棋 |
| `idle` | `xiaotiqin-yanzou` | 18/61 | `xiaotiqin-yanzou.gif` | 0,30,60,90 | 小提琴演奏 |
| `idle` | `yaoshan-naliang` | 19/61 | `yaoshan-naliang.gif` | 0,30,60,90 | 摇扇纳凉 |
| `idle` | `sanqiu-paojie` | 20/61 | `sanqiu-paojie.gif` | 0,30,60,90 | 泡脚 ? |
| `idle` | `hudie-mifeng-huanrao-touding-kaihua` | 21/61 | `hudie-mifeng-huanrao-touding-kaihua.gif` | 0,30,60,90 | 蝴蝶蜜蜂环绕·头顶开花 |
| `idle` | `dongwu-huanrao` | 22/61 | `dongwu-huanrao.gif` | 0,30,60,90 | 小动物环绕 |
| `idle` | `menghua-xiaoyouling` | 23/61 | `menghua-xiaoyouling.gif` | 0,30,60,90 | 梦华小幽灵 ? |
| `idle` | `jin-dai-ding-dang` | 24/61 | `jin-dai-ding-dang.gif` | 0,30,60,90 | 锦袋叮当 ? |
| `idle` | `shu-jin-zhou-mei` | 25/61 | `shu-jin-zhou-mei.gif` | 0,30,60,90 | 数金皱眉 ? |
| `idle` | `wu-shitou` | 26/61 | `wu-shitou.gif` | 0,30,60,90 | 捂石头 ? |
| `idle` | `wan-shuiqiang` | 27/61 | `wan-shuiqiang.gif` | 0,30,60,90 | 玩水枪 |
| `idle` | `wan-youxi-qijibaituai` | 28/61 | `wan-youxi-qijibaituai.gif` | 0,30,60,90 | 玩游戏·百态 ? |
| `idle` | `chui-qiqiu` | 29/61 | `chui-qiqiu.gif` | 0,30,60,90 | 吹气球 |
| `idle` | `fang-fengzheng` | 30/61 | `fang-fengzheng.gif` | 0,30,60,90 | 放风筝 |
| `idle` | `fanghedeng` | 31/61 | `fanghedeng.gif` | 0,30,60,90 | 放河灯 |
| `idle` | `fang-kongmingdeng` | 32/61 | `fang-kongmingdeng.gif` | 0,30,60,90 | 放孔明灯 |
| `idle` | `taotang-nanguadeng` | 33/61 | `taotang-nanguadeng.gif` | 0,30,60,90 | 掏糖·南瓜灯 |
| `idle` | `zhuangdian-shengdanshu` | 34/61 | `zhuangdian-shengdanshu.gif` | 0,30,60,90 | 装饰圣诞树 |
| `idle` | `chuanzhenqiqiao` | 35/61 | `chuanzhenqiqiao.gif` | 0,30,60,90 | 穿针乞巧 |
| `idle` | `yuandi-piaofu-tabu` | 36/61 | `yuandi-piaofu-tabu.gif` | 0,30,60,90 | 原地漂浮踏步 |
| `idle` | `yuandi-zuozhuan-benpao` | 37/61 | `yuandi-zuozhuan-benpao.gif` | 0,30,60,90 | 原地左转奔跑 |
| `idle` | `yuandi-zhongli-xiadun-yasuo` | 38/61 | `yuandi-zhongli-xiadun-yasuo.gif` | 0,30,60,90 | 原地重力下蹲 |
| `idle` | `yuandi-dunxia-wan-wanju-qiche` | 39/61 | `yuandi-dunxia-wan-wanju-qiche.gif` | 0,30,60,90 | 蹲下玩玩具车 |
| `idle` | `zhengti-huanzhuang-shise` | 40/61 | `zhengti-huanzhuang-shise.gif` | 0,30,60,90 | 整体换装 |
| `idle` | `chi-baifan` | 41/61 | `chi-baifan.gif` | 0,30,60,90 | 吃白饭 |
| `idle` | `chi-bingqilin-ronghua` | 42/61 | `chi-bingqilin-ronghua.gif` | 0,30,60,90 | 吃冰淇淋融化 |
| `idle` | `chi-changshoumian` | 43/61 | `chi-changshoumian.gif` | 0,30,60,90 | 吃长寿面 |
| `idle` | `chi-chongyanggao` | 44/61 | `chi-chongyanggao.gif` | 0,30,60,90 | 吃重阳糕 |
| `idle` | `chi-dazhaxie` | 45/61 | `chi-dazhaxie.gif` | 0,30,60,90 | 吃大闸蟹 |
| `idle` | `chi-labazhou` | 46/61 | `chi-labazhou.gif` | 0,30,60,90 | 吃腊八粥 |
| `idle` | `chi-niangao` | 47/61 | `chi-niangao.gif` | 0,30,60,90 | 吃年糕 |
| `idle` | `chi-qingtuan` | 48/61 | `chi-qingtuan.gif` | 0,30,60,90 | 吃青团 |
| `idle` | `chi-tanghulu` | 49/61 | `chi-tanghulu.gif` | 0,30,60,90 | 吃糖葫芦 |
| `idle` | `chi-wancan` | 50/61 | `chi-wancan.gif` | 0,30,60,90 | 吃晚餐 |
| `idle` | `chi-wucan` | 51/61 | `chi-wucan.gif` | 0,30,60,90 | 吃午餐 |
| `idle` | `chi-xigua` | 52/61 | `chi-xigua.gif` | 0,30,60,90 | 吃西瓜 |
| `idle` | `chi-zaocan` | 53/61 | `chi-zaocan.gif` | 0,30,60,90 | 吃早餐 |
| `idle` | `chi-zongzi` | 54/61 | `chi-zongzi.gif` | 0,30,60,90 | 吃粽子 |
| `idle` | `chijiaozi` | 55/61 | `chijiaozi.gif` | 0,30,60,90 | 吃饺子 |
| `idle` | `chitangyuan` | 56/61 | `chitangyuan.gif` | 0,30,60,90 | 吃汤圆 |
| `idle` | `dakou-chi-lingshi` | 57/61 | `dakou-chi-lingshi.gif` | 0,30,60,90 | 大口吃零食 |
| `idle` | `shuan-huoguo` | 58/61 | `shuan-huoguo.gif` | 0,30,60,90 | 涮火锅 |
| `idle` | `zhongqiu-shangyue-chi-yuebing` | 59/61 | `zhongqiu-shangyue-chi-yuebing.gif` | 0,30,60,90 | 中秋赏月吃月饼 |
| `idle` | `cha-zhuyu-shangju` | 60/61 | `cha-zhuyu-shangju.gif` | 0,30,60,90 | 重阳赏菊插茱萸 |
| `idle` | `xie-fuzi` | 61/61 | `xie-fuzi.gif` | 0,30,60,90 | 写福字 |
| `sleep` | `yuandi-xiaoqi-chenmian` | 01/3 | `yuandi-xiaoqi-chenmian.gif` | 0,30,60,90 | 原地小憩沉眠 |
| `sleep` | `haqian-liantian` | 02/3 | `haqian-liantian.gif` | 0,30,60,90 | 哈欠连天 |
| `sleep` | `beiluoye-yanmo` | 03/3 | `beiluoye-yanmo.gif` | 0,30,60,90 | 被落叶掩埋 |
| `think` | `gongzuozhuangtai-sikao-maopao` | 01/3 | `gongzuozhuangtai-sikao-maopao.gif` | 0,30,60,90 | 思考冒泡 |
| `think` | `shendu-sikao-suisuinian` | 02/3 | `shendu-sikao-suisuinian.gif` | 0,30,60,90 | 深度思考碎碎念 |
| `think` | `yuandi-zhuanxin-wan-mofang` | 03/3 | `yuandi-zhuanxin-wan-mofang.gif` | 0,30,60,90 | 专心玩魔方 |
| `stream` | `suisuinian-cazhuo-suisuinian` | 01/5 | `suisuinian-cazhuo-suisuinian.gif` | 0,30,60,90 | 碎碎念·擦桌 |
| `stream` | `suisuinian-duiping-suisuinian` | 02/5 | `suisuinian-duiping-suisuinian.gif` | 0,30,60,90 | 碎碎念·对屏 |
| `stream` | `suisuinian-fadai-suisuinian` | 03/5 | `suisuinian-fadai-suisuinian.gif` | 0,30,60,90 | 碎碎念·发呆 |
| `stream` | `youxian-hengga` | 04/5 | `youxian-hengga.gif` | 0,30,60,90 | 悠闲哼歌 |
| `stream` | `chui-dizi` | 05/5 | `chui-dizi.gif` | 0,30,60,90 | 吹笛子 |
| `tool` | `xie-daima` | 01/6 | `xie-daima.gif` | 0,30,60,90 | 写代码 |
| `tool` | `gongzuozhuangtai-manglu-dianan` | 02/6 | `gongzuozhuangtai-manglu-dianan.gif` | 0,30,60,90 | 忙碌点按 |
| `tool` | `gongzuozhuangtai-qingdian-guidang` | 03/6 | `gongzuozhuangtai-qingdian-guidang.gif` | 0,30,60,90 | 清点归档 |
| `tool` | `qingkuai-jilu` | 04/6 | `qingkuai-jilu.gif` | 0,30,60,90 | 轻快记录 |
| `tool` | `yuandi-qiaoji-zhuomian-hudong` | 05/6 | `yuandi-qiaoji-zhuomian-hudong.gif` | 0,30,60,90 | 敲击桌面 |
| `tool` | `chi-token` | 06/6 | `chi-token.gif` | 0,30,60,90 | 吃 token |
| `approval` | `dianji-huiying-haixiu-jingya` | 01/2 | `dianji-huiying-haixiu-jingya.gif` | 0,30,60,90 | 点击回应·害羞惊讶 |
| `approval` | `beixiayitiao-zhamao` | 02/2 | `beixiayitiao-zhamao.gif` | 0,30,60,90 | 被吓一跳炸毛 |
| `question` | `gongzuozhuangtai-yuandi-duobu-zhangwang` | 01/3 | `gongzuozhuangtai-yuandi-duobu-zhangwang.gif` | 0,30,60,90 | 踱步张望 |
| `question` | `dongzhangxiwang` | 02/3 | `dongzhangxiwang.gif` | 0,30,60,90 | 东张西望 |
| `question` | `shia-chishenme` | 03/3 | `shia-chishenme.gif` | 0,30,60,90 | 吃什么呢 |
| `error` | `gongzuozhuangtai-chuitou-tanqi-maohan` | 01/4 | `gongzuozhuangtai-chuitou-tanqi-maohan.gif` | 0,15,30,44 | 垂头叹气冒汗 |
| `error` | `fen-wen-bu-sheng` | 02/4 | `fen-wen-bu-sheng.gif` | 0,30,60,90 | 愤愤不平 ? |
| `error` | `dai-kong-ru-xi` | 03/4 | `dai-kong-ru-xi.gif` | 0,30,60,90 | 袋空如洗 ? |
| `error` | `yong-jingyu-weiba-paidadi` | 04/4 | `yong-jingyu-weiba-paidadi.gif` | 0,30,60,90 | 鲸鱼尾巴拍地 |
| `done` | `gongzuozhuangtai-queyue-qingzhu` | 01/9 | `gongzuozhuangtai-queyue-qingzhu.gif` | 0,30,60,90 | 雀跃庆祝 |
| `done` | `fang-yanhua` | 02/9 | `fang-yanhua.gif` | 0,30,60,90 | 放烟花 |
| `done` | `yuandi-tiaoyue-zhuasui-touding-wupin` | 03/9 | `yuandi-tiaoyue-zhuasui-touding-wupin.gif` | 0,30,60,90 | 跳跃抓碎头顶物品 |
| `done` | `shou-hongbao` | 04/9 | `shou-hongbao.gif` | 0,30,60,90 | 收红包 |
| `done` | `qian-dai-man-yi` | 05/9 | `qian-dai-man-yi.gif` | 0,30,60,90 | 钱袋满溢 |
| `done` | `qian-dai-ru-chang` | 06/9 | `qian-dai-ru-chang.gif` | 0,30,60,90 | 钱袋入账 |
| `done` | `pingkong-shenghua` | 07/9 | `pingkong-shenghua.gif` | 0,30,60,90 | 凭空生花 |
| `done` | `bian-gezi` | 08/9 | `bian-gezi.gif` | 0,30,60,90 | 变鸽子 |
| `done` | `chai-liwu` | 09/9 | `chai-liwu.gif` | 0,30,60,90 | 拆礼物 |
| `petted` | `dianji-huiying-kaixin-yuedong` | 01/8 | `dianji-huiying-kaixin-yuedong.gif` | 0,30,60,90 | 点击回应·开心跃动 |
| `petted` | `dianji-huiying-naoyang-gegexiao` | 02/8 | `dianji-huiying-naoyang-gegexiao.gif` | 0,30,60,90 | 点击回应·挠痒咯咯笑 |
| `petted` | `dianji-huiying-yuanqi-huishou` | 03/8 | `dianji-huiying-yuanqi-huishou.gif` | 0,30,60,90 | 点击回应·元气挥手 |
| `petted` | `dianji-huiying-aojiao-shengqi-ceshen-zhanshi` | 04/8 | `dianji-huiying-aojiao-shengqi-ceshen-zhanshi.gif` | 0,30,60,90 | 点击回应·傲娇生气 |
| `petted` | `beishubiao-tuozhuai-xuankong-fankui` | 05/8 | `beishubiao-tuozhuai-xuankong-fankui.gif` | 0,30,60,90 | 被鼠标拖拽悬空 |
| `petted` | `qingkuai-yaobaiwu` | 06/8 | `qingkuai-yaobaiwu.gif` | 0,30,60,90 | 轻快摇摆舞 |
| `petted` | `xiaofudu-yuandi-360du-xuanzhuan-zhanshi` | 07/8 | `xiaofudu-yuandi-360du-xuanzhuan-zhanshi.gif` | 0,30,60,90 | 原地360°旋转展示 |
| `petted` | `keai-zhaiwu` | 08/8 | `keai-zhaiwu.gif` | 0,30,60,90 | 可爱宅舞 |
| `woken` | `da-keshui-bei-jingxing` | 01/2 | `da-keshui-bei-jingxing.gif` | 0,30,60,90 | 打瞌睡被惊醒 |
| `woken` | `touchi-lingshi-bei-zhuazhu` | 02/2 | `touchi-lingshi-bei-zhuazhu.gif` | 0,30,60,90 | 偷吃零食被抓住 |

## Coverage

Body crop: `(46, 4, 174, 132)` (a 128px square in source pixels).  The dock crop is a
64px square around the head, downscaled 2:1 to 32px.

These takes draw outside the body crop, so those pixels are clipped:

- `jingyu-tu-paopao-texiao` (idle): content box (42, 12, 148, 113)
- `hudie-mifeng-huanrao-touding-kaihua` (idle): content box (24, 7, 199, 113)
- `dongwu-huanrao` (idle): content box (34, 17, 182, 116)
- `wan-shuiqiang` (idle): content box (66, 22, 204, 118)
- `fang-fengzheng` (idle): content box (43, 0, 167, 113)
- `fang-kongmingdeng` (idle): content box (65, 1, 149, 114)
- `zhuangdian-shengdanshu` (idle): content box (32, 19, 163, 120)
- `chuanzhenqiqiao` (idle): content box (67, 22, 183, 114)
- `chi-wancan` (idle): content box (41, 21, 176, 113)
- `zhongqiu-shangyue-chi-yuebing` (idle): content box (69, 18, 200, 114)
- `beiluoye-yanmo` (sleep): content box (43, 15, 188, 116)
- `shendu-sikao-suisuinian` (think): content box (34, 20, 188, 114)
- `youxian-hengga` (stream): content box (53, 3, 167, 114)
- `chui-dizi` (stream): content box (28, 15, 187, 113)
- `shia-chishenme` (question): content box (21, 18, 204, 114)
- `fang-yanhua` (done): content box (10, 0, 208, 124)
- `yuandi-tiaoyue-zhuasui-touding-wupin` (done): content box (46, 0, 176, 114)

Widen `BODY_BOX` in the generator (and re-run) if one of them matters.
