// ===== 「同僚と遊ぶ」アドベンチャーパートのシナリオデータ =====
// main.js より前に読み込まれる、素のスクリプト（グローバル変数として定義する）。
// ここで使う adjustPartnerRelationship / recordAdv1Choice / recordAdv2Choice /
// markDreamRouteCompleted / routeToRelationshipEnding は main.js 側で定義されるが、
// 実際に呼ばれるのはプレイ中（main.js 読み込み後）なので問題ない。
//
// ※ 現在は「主人公：男性・僕」「同僚：女性」の組み合わせで文面を統一している
//   （自機・同僚の実際の性別選択に関わらず、この文面をそのまま使う）。
//
// 全体の分岐構造（① 〜 ⑫）：
//   ADV1（①） -A→ ADV2-A（②） -C→ ADV3-A-C（④、夢フラグ成立時は⑧） -通常2択→ 好感度ルート（⑨⑩⑪）
//                                -D→ ADV3-A-D（⑤）                  -通常2択→ 好感度ルート
//              -B→ ADV2-B（③） -E→ ADV3-B-E（⑥）                  -通常2択→ 好感度ルート
//                                -F→ ADV3-B-F（⑦）                  -通常2択→ 好感度ルート
//   ⑧ADV3夢版 -「夢の話を続ける」→ ⑫夢ルート（完走で dreamRouteCompleted = true）
//             -「今は仕事の話に戻す」→ 好感度ルート（⑨⑩⑪）
//   ADV4以降：選択肢なしで、その時点の関係性のまま⑨⑩⑪へ直行

// 文言が { male, female } の場合はその話し手（同僚ならその性別、自分なら自機の性別）に応じた方を、
// 文字列ならそのまま返す（現状は文字列のみを使用）
function resolveGenderedAdventureText(value, gender) {
  if (typeof value === 'string') return value;
  return gender === 'female' ? value.female : value.male;
}

// 導入部（setupPages）を「……（続ける）」の1択で読み進め、最後のページで本当の2択を提示する。
// 各選択肢ごとに、選んだ後の結末（outcomePages）を同様に読み進め、最後にfinalNextへ抜ける。
// finalNext省略時はnull（=このアドベンチャーを終了して元のゲームへ戻る）
function buildAdvScene(prefix, setupPages, choiceDefs) {
  const nodes = {};
  setupPages.forEach((text, i) => {
    const isLastSetup = i === setupPages.length - 1;
    nodes[`${prefix}_s${i}`] = {
      text,
      choices: isLastSetup
        ? choiceDefs.map((c, ci) => ({
            label: c.label,
            next: `${prefix}_c${ci}_o0`,
            effects: c.effects || (() => {})
          }))
        : [{ label: '……（続ける）', next: `${prefix}_s${i + 1}`, effects: () => {} }]
    };
  });
  choiceDefs.forEach((c, ci) => {
    c.outcomePages.forEach((text, oi) => {
      const isLastOutcome = oi === c.outcomePages.length - 1;
      nodes[`${prefix}_c${ci}_o${oi}`] = {
        text,
        choices: isLastOutcome
          ? [{ label: '……', next: c.finalNext !== undefined ? c.finalNext : null, effects: () => {} }]
          : [{ label: '……（続ける）', next: `${prefix}_c${ci}_o${oi + 1}`, effects: () => {} }]
      };
    });
  });
  return { start: `${prefix}_s0`, nodes };
}

// 選択肢のない、一本道のシーン（複数ページを「……（続ける）」でつなぎ、最後にfinalEffects→finalNextへ）
function buildLinearScene(prefix, pages, finalEffects, finalNext) {
  const nodes = {};
  pages.forEach((text, i) => {
    const isLast = i === pages.length - 1;
    nodes[`${prefix}_p${i}`] = {
      text,
      choices: [
        isLast
          ? { label: '……', next: finalNext !== undefined ? finalNext : null, effects: finalEffects || (() => {}) }
          : { label: '……（続ける）', next: `${prefix}_p${i + 1}`, effects: () => {} }
      ]
    };
  });
  return { start: `${prefix}_p0`, nodes };
}

const partnerAdventureScenes = {};

// ① ADV1共通シナリオ（配置換えから一週間後）
Object.assign(partnerAdventureScenes, { adv1: buildAdvScene('adv1', [
  '一週間一緒に仕事をした同僚同士。\n' +
  '同僚「おはようございます。もう新しい席には慣れました？」\n' +
  '？？？「少しは。プリンターの場所で迷わなくなった」\n' +
  '同僚「それは大きな進歩ですね」\n' +
  '？？？「この部署の迷宮度が高いんだよ」\n' +
  '同僚は軽く笑う。\n' +
  '同僚は何も覚えていない。\n' +
  'けれど、夢で一緒に働いた記憶は鮮明に残っている。\n' +
  '同僚「この資料、少し一緒に見てもらえますか？」'
], [
  {
    label: '「もちろん。一緒に見よう」',
    effects: () => { adjustPartnerRelationship(10); recordAdv1Choice('A'); },
    outcomePages: [
      '？？？「もちろん。一緒に見よう」\n' +
      '同僚「助かります。？？？さん、意外と話しやすいです」\n' +
      '？？？「意外と？」\n' +
      '同僚「まだ一週間なので、暫定評価です」'
    ]
  },
  {
    label: '「あとでいい？ 先にメールだけ返したい」',
    effects: () => { adjustPartnerRelationship(-10); recordAdv1Choice('B'); },
    outcomePages: [
      '？？？「あとでいい？ 先にメールだけ返したい」\n' +
      '同僚「はい。わかりました」\n' +
      '？？？「すぐ終わらせる」\n' +
      '同僚「大丈夫です。まだ一週間ですし、距離感もありますよね」\n' +
      '丁寧な言葉だった。\n' +
      'けれど、少しだけ遠ざかった気がした。'
    ]
  }
]) });

// ② ADV2-A（ADV1で「A：同僚を信じて踏み込む」を選んだ場合）
Object.assign(partnerAdventureScenes, { adv2A: buildAdvScene('adv2A', [
  '配置換えから二週間ほど経った。\n' +
  '同僚「この二週間で、だいぶ連携しやすくなりましたね」\n' +
  '？？？「そうだね。資料で遭難する回数も減った」\n' +
  '同僚「資料で遭難する前提なんですか」\n' +
  '？？？「この部署、たまに森みたいだから」\n' +
  '同僚は笑う。\n' +
  '？？？はその表情を見て、夢の中で見た夜を思い出す。\n' +
  '割れた窓。黒い影。届かなかった手。\n' +
  '同僚「どうかしました？」\n' +
  '？？？「いや。少し考えごと」\n' +
  '同僚「この説明、一緒に考えてもらえますか？」'
], [
  {
    label: '「一緒に考えよう」',
    effects: () => { adjustPartnerRelationship(10); recordAdv2Choice('C'); },
    outcomePages: [
      '？？？「一緒に考えよう。そのほうが見落としも減る」\n' +
      '同僚「はい。そのほうが安心します」\n' +
      '？？？「安心？」\n' +
      '同僚「なんとなくですけど。一人より、二人のほうがいい気がして」\n' +
      '？？？は、その言葉に少しだけ息を止めた。'
    ]
  },
  {
    label: '「先にこっちで案を作るよ」',
    effects: () => { adjustPartnerRelationship(-10); recordAdv2Choice('D'); },
    outcomePages: [
      '？？？「先にこっちで案を作るよ。そのほうが早いと思う」\n' +
      '同僚「はい。助かります。でも……」\n' +
      '？？？「でも？」\n' +
      '同僚「一緒に考えたい、という意味でした」\n' +
      '？？？「悪い。急ぎすぎた」\n' +
      '同僚「いえ。次はお願いします」'
    ]
  }
]) });

// ③ ADV2-B（ADV1で「B：距離を取って様子を見る」を選んだ場合）
Object.assign(partnerAdventureScenes, { adv2B: buildAdvScene('adv2B', [
  '配置換えから二週間経った。\n' +
  '同僚「先週の資料、結局ひとりで進めてましたね」\n' +
  '？？？「悪かった。声をかけてくれたのに」\n' +
  '同僚「まだお互い探り探りですし、仕方ないです」\n' +
  '？？？「仕方ない、で終わらせたくはないかな」\n' +
  '同僚は少しだけ目を丸くする。\n' +
  '同僚「じゃあ、今日は一緒に確認しますか？」'
], [
  {
    label: '「見よう。今度こそちゃんと」',
    effects: () => { adjustPartnerRelationship(10); recordAdv2Choice('E'); },
    outcomePages: [
      '？？？「見よう。今度こそちゃんと」\n' +
      '同僚「はい。今度こそ、お願いします」\n' +
      '？？？「言い方が少し重いな」\n' +
      '同僚「軽めです」'
    ]
  },
  {
    label: '「先に自分で直してから見せる」',
    effects: () => { adjustPartnerRelationship(-10); recordAdv2Choice('F'); },
    outcomePages: [
      '？？？「先に自分で直してから見せる」\n' +
      '同僚「……また一人でやるんですね」\n' +
      '？？？「そういうつもりじゃない」\n' +
      '同僚「そう見えます」\n' +
      '沈黙が落ちる。\n' +
      '？？？は前回と同じ失敗をしている気がした。'
    ]
  }
]) });

// ④ ADV3通常-A-C（ADV1でA、ADV2でCを選んだが、夢フラグが不成立の場合）
Object.assign(partnerAdventureScenes, { adv3AC: buildAdvScene('adv3AC', [
  '配置換えから三週間。\n' +
  '同僚「もう三週間ですね。最初より、だいぶ仕事しやすくなりました」\n' +
  '？？？「うん、そう思う」\n' +
  '同僚「この資料も、かなり早く終わりましたし」\n' +
  '？？？「二人でやると迷いにくいね」\n' +
  '同僚「資料でも？」\n' +
  '？？？「資料でも」\n' +
  '本当は、夢でも、と言いかけた。\n' +
  'けれど？？？は飲み込む。'
], [
  {
    label: '「次も一緒にやりたい」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: ['？？？「次も一緒にやりたい」\n同僚「はい。私もそのほうがやりやすいです」'],
    finalNext: () => routeToRelationshipEnding()
  },
  {
    label: '「今日は助かった」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: ['？？？「今日は助かった」\n同僚「こちらこそ。三週間で、だいぶ慣れてきましたね」'],
    finalNext: () => routeToRelationshipEnding()
  }
]) });

// ⑤ ADV3通常-A-D（ADV1でA、ADV2でDを選んだ場合）
Object.assign(partnerAdventureScenes, { adv3AD: buildAdvScene('adv3AD', [
  '配置換えから三週間経った。\n' +
  '同僚「作業は終わりましたね」\n' +
  '？？？「ああ。でも、途中少し急ぎすぎた」\n' +
  '同僚「そうですね。少し置いていかれた感じはありました」\n' +
  '？？？「悪い」\n' +
  '同僚「謝ってもらえたので、そこは大丈夫です」\n' +
  '関係は悪くない。\n' +
  'ただ、夢の話を切り出すには、まだ少し足りない。'
], [
  {
    label: '「次は先に相談する」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: ['？？？「次は先に相談する」\n同僚「はい。それなら大丈夫です」'],
    finalNext: () => routeToRelationshipEnding()
  },
  {
    label: '「早く進めたかったんだ」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: [
      '？？？「早く進めたかったんだ」\n' +
      '同僚「理由はわかります。でも、一緒にやる意味も残しておきたいです」\n' +
      '主人公「……そうだね」'
    ],
    finalNext: () => routeToRelationshipEnding()
  }
]) });

// ⑥ ADV3通常-B-E（ADV1でB、ADV2でEを選んだ場合）
Object.assign(partnerAdventureScenes, { adv3BE: buildAdvScene('adv3BE', [
  '配置換えから三週間経った。\n' +
  '同僚「この三週間、少しずつ慣れてきた感じはあります」\n' +
  '？？？「こちらは、少し空回りしてたな」\n' +
  '同僚「自覚があるなら、かなりましです」\n' +
  '？？？「評価が厳しい」\n' +
  '同僚「でも、戻ってきてくれたので」\n' +
  'その一言が、？？？には妙に重く聞こえた。\n' +
  '前回は、戻れなかった。'
], [
  {
    label: '「次は最初から相談する」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: ['？？？「次は最初から相談する」\n同僚「はい。私も遠慮なく言います」'],
    finalNext: () => routeToRelationshipEnding()
  },
  {
    label: '「一人で進めたほうが楽な時もある」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: [
      '？？？「一人で進めたほうが楽な時もある」\n' +
      '同僚「それはわかります。でも、そればかりだと一緒にいる意味がなくなります」'
    ],
    finalNext: () => routeToRelationshipEnding()
  }
]) });

// ⑦ ADV3通常-B-F（ADV1でB、ADV2でFを選んだ場合）
Object.assign(partnerAdventureScenes, { adv3BF: buildAdvScene('adv3BF', [
  '配置換えから三週間経った。\n' +
  '同僚「終わりましたね。資料は」\n' +
  '？？？「資料は、だね」\n' +
  '同僚「私たちの会話は、まだ途中で止まっている感じです」\n' +
  '？？？「そうだね」\n' +
  '？？？は窓を見る。\n' +
  '夜のビル街。\n' +
  'その奥の黒が、前回の影と重なって見えた。'
], [
  {
    label: '「明日、ちゃんと話したい」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: ['主人公「明日、ちゃんと話したい」\n同僚「はい。私も、そのほうがいいと思います」'],
    finalNext: () => routeToRelationshipEnding()
  },
  {
    label: '「今日はこのまま帰ろう」',
    effects: () => adjustPartnerRelationship(5),
    outcomePages: [
      '？？？「今日はこのまま帰ろう」\n' +
      '同僚「はい。今話すと、余計こじれそうです」\n' +
      '？？？は、また間に合わなかった気がした。'
    ],
    finalNext: () => routeToRelationshipEnding()
  }
]) });

// ⑧ ADV3夢版（前世良好・2周目以降・ADV1/2/3突入時すべて関係性良好の場合のみ）
Object.assign(partnerAdventureScenes, { adv3Dream: buildAdvScene('adv3Dream', [
  '配置換えから三週間。\n' +
  '関係は良好に保たれていた。\n' +
  '？？？はずっと迷っていた。\n' +
  '同僚は覚えていない。\n' +
  'だが、自分だけが覚えているままでは、また同じ結末に近づいている気がした。\n' +
  '同僚「どうかしました？ 今日、ずっと窓を気にしてますけど」\n' +
  '？？？「……話したいことがあるんだ」\n' +
  '同僚「仕事の話ですか？」\n' +
  '？？？「仕事じゃない。夢の話。」\n' +
  '同僚は少しだけ首をかしげる。',

  '？？？「前にも一緒にこのオフィスで働いていた記憶があるんだ」\n' +
  '同僚「前にも？」\n' +
  '？？？「ああ。配置換えで初めて会ったはずなのに、君のことを知っていたんだ」\n' +
  '同僚「それは……夢、ですか？」\n' +
  '？？？「夢として覚えてる。でも、ただの夢じゃない」\n' +
  '？？？は窓を見る。\n' +
  '夜のガラスに、二人の姿が映っていた。\n' +
  '？？？「最後に、窓の外から黒い影が迫ってきた。君が襲われて、止めようとして、でも倒れた」\n' +
  '同僚の表情から、軽さが消える。\n' +
  '同僚「どうして、それを今まで黙っていたんですか？」\n' +
  '？？？「信じてもらえると思えなかった。それに、怖がらせたくなかった」\n' +
  '同僚「……今は？」\n' +
  '？？？「このまま黙っていたら、また失う気がする」'
], [
  {
    label: '「夢の話を続ける」',
    effects: () => {},
    outcomePages: [
      '？？？「あれは本当にただの夢かもしれない。でも、少なくとも、一度あの影に負けてる」\n' +
      '同僚「覚えていません。でも……」\n' +
      '？？？は窓を見た。\n' +
      '同僚「今、少しだけ怖い。知らないはずなのに、あの窓の外が」\n' +
      '？？？「なら、完全には消えてない」\n' +
      '同僚「……そうかもしれません」'
    ],
    finalNext: { scene: 'dreamRoute', node: 'dream_p0' }
  },
  {
    label: '「今は仕事の話に戻す」',
    effects: () => {},
    outcomePages: [
      '？？？「今は仕事の話に戻そう。急に全部話すには、重すぎる」\n' +
      '同僚「はい。でも、その話、なかったことにはしません」\n' +
      '？？？「ああ。いつか、ちゃんと話すね」'
    ],
    finalNext: () => routeToRelationshipEnding()
  }
]) });

// ⑫ 夢ルート（ADV3夢版で「夢の話を続ける」を選んだ場合。完走すると dreamRouteCompleted が立つ）
Object.assign(partnerAdventureScenes, { dreamRoute: buildLinearScene('dream', [
  '夜のオフィス。\n' +
  '？？？は、前回の記憶を同僚に話した。\n' +
  '同じ席。\n' +
  '同じ残業。\n' +
  '同じ窓。\n' +
  'そして、窓の外から迫ってきた黒い影。\n' +
  '同僚「…記憶にはありません。でも、聞いているだけで、胸がざわつきます」\n' +
  '？？？「記憶は消えていても、どこかに残ってるのかもしれない」\n' +
  'その時、窓の外がわずかに暗くなった。\n' +
  'ビルの明かりが、ひとつ、またひとつと黒に飲まれていく。\n' +
  '夜そのものより濃い影が、こちらへ近づいていた。',
  '同僚「…逃げますか？」\n' +
  '？？？は首を振る。\n' +
  '？？？「逃げても、また繰り返すだけだと思う」\n' +
  '同僚は震える手を握りしめる。\n' +
  'けれど、窓から目をそらさなかった。\n' +
  '同僚「なら、戦いましょう」\n' +
  '？？？「勝てる保証はない」\n' +
  '同僚「でも今回は、あなたが覚えています」\n' +
  '？？？「ああ。今度は、同じ終わりにはしない」',
  '黒い影が、窓の外いっぱいに広がっていく。\n' +
  'ガラスが小さく震えた。\n' +
  '二人は並んで立つ。\n' +
  '前回は、失った。\n' +
  '今回は、迎え撃つ。\n' +
  '？？？「行くよ」\n' +
  '同僚「はい」\n' +
  '窓の向こうで、黒い影が動く。'
], () => markDreamRouteCompleted(), null) });

// ⑨⑩⑪ 好感度ルート（通常2択の後、またはADV4以降は選択肢なしで直接ここへ入る）
Object.assign(partnerAdventureScenes, { endRoutes: {
  start: 'endGood',
  nodes: {
    // ⑨ 好感度：良好ルート
    endGood: {
      text:
        '同僚「この三週間、思ったより早かったです」\n' +
        '？？？「こちらも。配置換え直後は、もっと苦労すると思ってた」\n' +
        '同僚「仕事は、だいぶやりやすくなりました」\n' +
        '？？？「それはよかった」\n' +
        '？？？は窓を見る。\n' +
        'まだ、黒い影は来ていない。\n' +
        '同僚「また明日もお願いします」\n' +
        '？？？「ああ。また明日」\n' +
        'その言葉を、今度こそ守りたいと思った。',
      choices: [{ label: '……', next: null, effects: () => {} }]
    },
    // ⑩ 好感度：普通ルート
    endNormal: {
      text:
        '同僚「三週間経って、少しずつ慣れてきましたね」\n' +
        '？？？「そうだね。まだ調整中だけど」\n' +
        '同僚「そのくらいが普通だと思います」\n' +
        '？？？「普通、か」\n' +
        '？？？は苦笑する。\n' +
        '夢の記憶を持っている自分には、普通という言葉が少し遠かった。\n' +
        '同僚「また来週、少しずつ進めましょう」\n' +
        '？？？「ああ」\n' +
        '夢の話は、まだ切り出せなかった。',
      choices: [{ label: '……', next: null, effects: () => {} }]
    },
    // ⑪ 好感度：悪いルート
    endBad: {
      text:
        '同僚「今日は、ここまででいいですか」\n' +
        '？？？「ああ。お疲れさま」\n' +
        '同僚「お疲れさまです」\n' +
        '同僚は静かに席を立つ。\n' +
        '三週間。\n' +
        '？？？は、また関係性を改善できなかった。\n' +
        '窓の外に、黒いものがよぎる。\n' +
        '？？？「また、間に合わないのか。」\n' +
        '振り返った時には、もう何もなかった。',
      choices: [{ label: '……', next: null, effects: () => {} }]
    }
  }
} });
