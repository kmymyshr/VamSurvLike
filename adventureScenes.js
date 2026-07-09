// ===== 「同僚と遊ぶ」アドベンチャーパートのシナリオデータ =====
// main.js より前に読み込まれる、素のスクリプト（グローバル変数として定義する）。
// ここで使う adjustPartnerRelationship / grantSpecialSkillById / specialSkillEffects / recordAdv1Choice /
// recordAdv2Choice / markDreamRouteCompleted / routeToRelationshipEnding は main.js 側で定義されるが、
// 実際に呼ばれるのはプレイ中（main.js 読み込み後）なので問題ない。
//
// ※ ここに書かれている本文・選択肢の文言はすべて仮のプレースホルダーです。
//   後日、実際の文面に差し替える前提の「分岐構造だけを確認するための仮テキスト」です。
//
// 全体の分岐構造（① 〜 ⑫）：
//   ADV1（①） -A→ ADV2-A（②） -C→ ADV3-A-C（④、夢フラグ成立時は⑧） -通常2択→ 好感度ルート（⑨⑩⑪）
//                                -D→ ADV3-A-D（⑤）                  -通常2択→ 好感度ルート
//              -B→ ADV2-B（③） -E→ ADV3-B-E（⑥）                  -通常2択→ 好感度ルート
//                                -F→ ADV3-B-F（⑦）                  -通常2択→ 好感度ルート
//   ⑧ADV3夢版 -「夢の話をする」→ ⑫夢ルート（完走で dreamRouteCompleted = true）
//             -「夢の話をしない」→ 好感度ルート（⑨⑩⑪）
//   ADV4以降：選択肢なしで、その時点の関係性のまま⑨⑩⑪へ直行

// 文言が { male, female } の場合はその話し手（同僚ならその性別、自分なら自機の性別）に応じた方を、
// 文字列ならそのまま返す（「（既読だけつけて…）」のような行動描写は性別を問わないため文字列のまま）
function resolveGenderedAdventureText(value, gender) {
  if (typeof value === 'string') return value;
  return gender === 'female' ? value.female : value.male;
}

const partnerAdventureScenes = {
  // ① ADV1共通シナリオ
  adv1: {
    start: 'adv1_intro',
    nodes: {
      adv1_intro: {
        text: '（仮）ADV1共通シナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）選択肢A：同僚を信じて踏み込む', next: null,
            effects: () => { adjustPartnerRelationship(10); recordAdv1Choice('A'); } },
          { label: '（仮）選択肢B：距離を取って様子を見る', next: null,
            effects: () => { adjustPartnerRelationship(-10); recordAdv1Choice('B'); } }
        ]
      }
    }
  },

  // ② ADV2-A（ADV1で「A：同僚を信じて踏み込む」を選んだ場合）
  adv2A: {
    start: 'adv2a_intro',
    nodes: {
      adv2a_intro: {
        text: '（仮）ADV2-Aシナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）選択肢C：同僚の判断を尊重する', next: null,
            effects: () => { adjustPartnerRelationship(10); recordAdv2Choice('C'); } },
          { label: '（仮）選択肢D：一人で抱え込む', next: null,
            effects: () => { adjustPartnerRelationship(-10); recordAdv2Choice('D'); } }
        ]
      }
    }
  },

  // ③ ADV2-B（ADV1で「B：距離を取って様子を見る」を選んだ場合）
  adv2B: {
    start: 'adv2b_intro',
    nodes: {
      adv2b_intro: {
        text: '（仮）ADV2-Bシナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）選択肢E：関係を修復しようとする', next: null,
            effects: () => { adjustPartnerRelationship(10); recordAdv2Choice('E'); } },
          { label: '（仮）選択肢F：さらに距離を置く', next: null,
            effects: () => { adjustPartnerRelationship(-10); recordAdv2Choice('F'); } }
        ]
      }
    }
  },

  // ④ ADV3通常-A-C（ADV1でA、ADV2でCを選んだが、夢フラグが不成立の場合）
  adv3AC: {
    start: 'adv3ac_intro',
    nodes: {
      adv3ac_intro: {
        text: '（仮）ADV3通常-A-Cシナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）通常選択A', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) },
          { label: '（仮）通常選択B', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) }
        ]
      }
    }
  },

  // ⑤ ADV3通常-A-D（ADV1でA、ADV2でDを選んだ場合）
  adv3AD: {
    start: 'adv3ad_intro',
    nodes: {
      adv3ad_intro: {
        text: '（仮）ADV3通常-A-Dシナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）通常選択A', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) },
          { label: '（仮）通常選択B', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) }
        ]
      }
    }
  },

  // ⑥ ADV3通常-B-E（ADV1でB、ADV2でEを選んだ場合）
  adv3BE: {
    start: 'adv3be_intro',
    nodes: {
      adv3be_intro: {
        text: '（仮）ADV3通常-B-Eシナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）通常選択A', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) },
          { label: '（仮）通常選択B', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) }
        ]
      }
    }
  },

  // ⑦ ADV3通常-B-F（ADV1でB、ADV2でFを選んだ場合）
  adv3BF: {
    start: 'adv3bf_intro',
    nodes: {
      adv3bf_intro: {
        text: '（仮）ADV3通常-B-Fシナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）通常選択A', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) },
          { label: '（仮）通常選択B', next: () => routeToRelationshipEnding(),
            effects: () => adjustPartnerRelationship(5) }
        ]
      }
    }
  },

  // ⑧ ADV3夢版（前世良好・2周目以降・ADV1/2/3突入時すべて関係性良好の場合のみ）
  adv3Dream: {
    start: 'adv3dream_intro',
    nodes: {
      adv3dream_intro: {
        text: '（仮）ADV3夢版シナリオの本文プレースホルダー。',
        choices: [
          { label: '（仮）夢の話をする', next: { scene: 'dreamRoute', node: 'dream_start' },
            effects: () => {} },
          { label: '（仮）夢の話をしない', next: () => routeToRelationshipEnding(),
            effects: () => {} }
        ]
      }
    }
  },

  // ⑫ 夢ルート（ADV3夢版で「夢の話をする」を選んだ場合。完走すると dreamRouteCompleted が立つ）
  dreamRoute: {
    start: 'dream_start',
    nodes: {
      dream_start: {
        text: '（仮）夢ルートの本文プレースホルダー（前世記憶ルート）。',
        choices: [
          { label: '（仮）……（続ける）', next: null,
            effects: () => markDreamRouteCompleted() }
        ]
      }
    }
  },

  // ⑨⑩⑪ 好感度ルート（通常2択の後、またはADV4以降は選択肢なしで直接ここへ入る）
  endRoutes: {
    // ADV4以降、直接この中のいずれかのノードへ入る（このscene自体のstartは使われない）
    start: 'endGood',
    nodes: {
      // ⑨ 好感度：良好ルート
      endGood: {
        text: '（仮）好感度：良好ルートの本文プレースホルダー。',
        choices: [
          { label: '（仮）……（続ける）', next: null, effects: () => {} }
        ]
      },
      // ⑩ 好感度：普通ルート
      endNormal: {
        text: '（仮）好感度：普通ルートの本文プレースホルダー。',
        choices: [
          { label: '（仮）……（続ける）', next: null, effects: () => {} }
        ]
      },
      // ⑪ 好感度：悪いルート
      endBad: {
        text: '（仮）好感度：悪いルートの本文プレースホルダー。',
        choices: [
          { label: '（仮）……（続ける）', next: null, effects: () => {} }
        ]
      }
    }
  }
};
