# V3 桥接 · 中文 · B 组

## bridges — 状态之间的接话 (133 条)

| from | to | tone | seq | line |
|---|---|---|---|---|
| approval | read | calm |  | 好，那我接着看 |
| approval | read | busy |  | 嗯，继续往下翻 |
| approval | read | formal |  | 明白，这就回去看 |
| approval | read | calm |  | 行，我回到刚才那页 |
| approval | read | busy |  | 那我把眼睛挪回去 |
| approval | write | bright |  | 那，我这就动笔 |
| approval | write | busy |  | 嗯，接着刚才那行 |
| approval | write | calm |  | 行，落笔往下写 |
| approval | write | formal |  | 明白，我这就续写 |
| approval | write | bright | 1/2 | 好，那我写下去了 |
| approval | write | bright | 2/2 | …这次写得稳 |
| approval | shell | calm |  | 好，那就敲下去 |
| approval | shell | busy |  | 嗯，我接着跑 |
| approval | shell | formal |  | 明白了，继续执行 |
| approval | shell | calm |  | 行，手上不停 |
| approval | shell | busy |  | 那我把命令送出去 |
| approval | error | worry |  | 刚动手就出岔子 |
| approval | error | worry |  | 好，那我再试一次 |
| approval | error | calm |  | 行吧，从头再来 |
| approval | error | worry |  | 嗯…手又抖了一下 |
| approval | error | worry |  | 那就退回去重来 |
| question | read | bright |  | 明白了，去看一眼 |
| question | read | calm |  | 好，那我照着翻 |
| question | read | busy |  | 嗯，方向有了 |
| question | read | formal |  | 记下了，这就查阅 |
| question | read | bright |  | 清楚了，翻开来看看 |
| question | write | bright |  | 懂了，那我改起来 |
| question | write | calm |  | 好，照你说的写 |
| question | write | busy |  | 嗯，这下能落笔了 |
| question | write | formal |  | 领会了，这就改 |
| question | write | bright |  | 清楚了，动手写 |
| planReview | write | busy |  | 那就照这份来改 |
| planReview | write | bright |  | 好，按计划动笔 |
| planReview | write | calm |  | 嗯，步骤很清楚了 |
| planReview | write | formal |  | 谨遵此案，开始修改 |
| planReview | write | calm |  | 行，我照着往下写 |
| planReview | shell | bright |  | 好，按单子跑起来 |
| planReview | shell | busy |  | 嗯，照着这份执行 |
| planReview | shell | calm |  | 那就一步一步敲 |
| planReview | shell | formal |  | 既定，这就依序执行 |
| planReview | shell | busy |  | 清楚了，开始动手 |
| planReview | plan | busy |  | 嗯，那我再理一遍 |
| planReview | plan | calm |  | 好，接着往下排 |
| planReview | plan | formal |  | 明白，容我细排 |
| planReview | plan | bright |  | 清楚，我这就顺下去 |
| planReview | plan | calm |  | 行，把剩下的也列上 |
| error | shell | worry |  | 缓过来了，再敲一次 |
| error | shell | worry |  | 这次慢慢来 |
| error | shell | calm |  | 嗯，我小心地跑 |
| error | shell | busy |  | 好，重新试一遍 |
| error | shell | worry | 1/2 | 手还有点抖 |
| error | shell | worry | 2/2 | …但得接着跑 |
| error | read | worry |  | 先把它翻开看看 |
| error | read | calm |  | 嗯，回头查查原委 |
| error | read | worry |  | 让我仔细读一遍 |
| error | read | busy |  | 好，去文件里找答案 |
| error | read | formal |  | 请容我重读一遍 |
| error | write | worry |  | 那我把这儿改回去 |
| error | write | calm |  | 嗯，重新改一遍 |
| error | write | busy |  | 好，慢慢写着修 |
| error | write | worry |  | 这回一笔一笔来 |
| error | write | formal |  | 明了，这就补正 |
| error | search | worry |  | 换个词再找找 |
| error | search | calm |  | 嗯，四处搜一搜 |
| error | search | busy |  | 好，绕着找一圈 |
| error | search | worry |  | 我再去翻翻别处 |
| error | search | formal |  | 这就换个方向查 |
| multi | done | bright |  | 手空了，全清了 |
| multi | done | busy |  | 嗯，一件不剩 |
| multi | done | bright |  | 好，这下安静了 |
| multi | done | calm |  | 行，都落地了 |
| multi | done | calm | 1/2 | 忙活半天 |
| multi | done | calm | 2/2 | …总算都齐了 |
| multi | error | worry |  | 有一件炸了 |
| multi | error | worry |  | 嗯…里头那个没过 |
| multi | error | calm |  | 先不管别的，救它 |
| multi | error | worry |  | 手忙脚乱里出了错 |
| multi | error | busy |  | 好，别的先放着 |
| deliver | done | bright |  | 都在你那儿了 |
| deliver | done | calm |  | 嗯，我这就可以歇手 |
| deliver | done | bright |  | 好，交完就轻了 |
| deliver | done | formal |  | 已交付，请查收 |
| deliver | done | bright | 1/2 | 东西都送上去了 |
| deliver | done | bright | 2/2 | …那我先退到一边 |
| deliver | idle | calm |  | 嗯，我在这儿待着 |
| deliver | idle | calm |  | 好，回角落里去 |
| deliver | idle | bright |  | 交完啦，我歇会儿 |
| deliver | idle | busy |  | 放下了，等你喊我 |
| deliver | idle | calm | 1/2 | 那我去边上飘着 |
| deliver | idle | calm | 2/2 | …有事就叫我 |
| tool | read | busy |  | 这件做完了，去看 |
| tool | read | bright |  | 好，接着翻文件 |
| tool | read | calm |  | 嗯，换我去读 |
| tool | read | busy |  | 手空出来，先读 |
| tool | read | formal |  | 此项已了，转去查阅 |
| tool | shell | busy |  | 一件了了，去敲 |
| tool | shell | bright |  | 好，转手跑一下 |
| tool | shell | calm |  | 嗯，接着执行 |
| tool | shell | formal |  | 此事已毕，转去执行 |
| tool | shell | busy |  | 换只手去跑 |
| tool | write | busy |  | 这个收尾，去写 |
| tool | write | bright |  | 好，落笔接着改 |
| tool | write | calm |  | 嗯，换我动笔 |
| tool | write | formal |  | 此项完毕，转去修改 |
| tool | write | busy | 1/2 | 手里这件清了 |
| tool | write | busy | 2/2 | …接着写下一处 |
| search | read | bright |  | 线索到手，翻开看 |
| search | read | busy |  | 嗯，就它了，细读 |
| search | read | calm |  | 好，这下能读了 |
| search | read | formal |  | 寻获，容我细看 |
| search | read | bright | 1/2 | 总算逮着了 |
| search | read | bright | 2/2 | …这就翻开它 |
| read | shell | busy |  | 心里有数，跑一下 |
| read | shell | bright |  | 好，拿去验一验 |
| read | shell | calm |  | 嗯，那我去试它 |
| read | shell | formal |  | 阅毕，转去执行 |
| read | shell | busy |  | 读通了，这就跑 |
| write | read | busy |  | 写完这处，去核对 |
| write | read | calm |  | 嗯，回头再读一遍 |
| write | read | bright |  | 好，去翻回来看看 |
| write | read | formal |  | 已改，转去覆阅 |
| write | read | calm | 1/2 | 笔先停一下 |
| write | read | calm | 2/2 | …我得回去读读 |
| shell | deliver | busy |  | 结果有了，呈上去 |
| shell | deliver | bright |  | 好，打包交给你 |
| shell | deliver | calm |  | 嗯，收一收拿来 |
| shell | deliver | formal |  | 执行已毕，谨呈结果 |
| shell | deliver | bright |  | 跑完了，拿给你看 |
| plan | tool | busy |  | 步骤定了，换手做 |
| plan | tool | bright |  | 好，照单子来 |
| plan | tool | calm |  | 嗯，按顺序动手 |
| plan | tool | formal |  | 计划已列，依次施行 |
| plan | tool | busy |  | 那就一件一件来 |
