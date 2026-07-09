// ===== 「同僚と遊ぶ」アドベンチャーパートのシナリオデータ =====
// main.js より前に読み込まれる、素のスクリプト（グローバル変数として定義する）。
// ここで使う adjustPartnerRelationship / grantSpecialSkillById / specialSkillEffects は
// main.js 側で定義されるが、実際に呼ばれるのはプレイ中（main.js 読み込み後）なので問題ない。

// シナリオデータ：シーンごとに開始ノードと、ノード間を選択肢でつなぐ分岐木を持つ
// 文言が { male, female } の場合はその話し手（同僚ならその性別、自分なら自機の性別）に応じた方を、
// 文字列ならそのまま返す（「（既読だけつけて…）」のような行動描写は性別を問わないため文字列のまま）
function resolveGenderedAdventureText(value, gender) {
  if (typeof value === 'string') return value;
  return gender === 'female' ? value.female : value.male;
}

const partnerAdventureScenes = {
  cafe: {
    start: 'intro',
    nodes: {
      intro: {
        text: {
          male: '急にごめんな、休みの日にメッセージしちゃって。ちょっとだけ、話し相手になってくれよ。',
          female: '急にごめんね、休みの日にメッセージしちゃった。ちょっとだけ、話し相手になってくれる？'
        },
        choices: [
          { label: {
              male: '実はさ、最近ちょっと仕事のことで悩んでてよ…',
              female: '実はね、最近ちょっと仕事のことで悩んでて…'
            }, next: 'consult',
            effects: () => adjustPartnerRelationship(15) },
          { label: {
              male: '全然いいぞ！休みの日っていつも何してるんだ？',
              female: '全然いいよ！休みの日っていつも何してるの？'
            }, next: 'hobby',
            effects: () => { adjustPartnerRelationship(10); grantSpecialSkillById('communication'); } },
          { label: '（既読だけつけて、少し考える）', next: 'silence',
            effects: () => {} }
        ]
      },
      consult: {
        text: {
          male: '大変だったな…。でも、一緒に頑張ろうぜ！俺もついてるから。',
          female: '大変だったね…。でも、一緒に頑張ろう！わたしもついてるから。'
        },
        choices: [
          { label: {
              male: 'ありがとな、そう言ってもらえると助かるよ',
              female: 'ありがとう、そう言ってもらえると救われるよ'
            }, next: null,
            effects: () => { adjustPartnerRelationship(10); specialSkillEffects.partnerDamageMultiplier *= 1.1; } },
          { label: '（照れくさくて、スタンプだけ送る）', next: null,
            effects: () => adjustPartnerRelationship(3) }
        ]
      },
      hobby: {
        text: {
          male: '休みの日は、実はこっそりカフェ巡りにハマっててさ。意外だろ？',
          female: '休みの日は、実はこっそりカフェ巡りにハマっててさ。意外でしょ？'
        },
        choices: [
          { label: {
              male: '気になるな！今度詳しく教えてくれよ',
              female: '気になる！今度詳しく教えてよ'
            }, next: null,
            effects: () => grantSpecialSkillById('learning-power') },
          { label: {
              male: '実は俺も、最近ハマってることがあってさ',
              female: '実は自分も、最近ハマってることがあってさ'
            }, next: null,
            effects: () => adjustPartnerRelationship(8) }
        ]
      },
      silence: {
        text: {
          male: '…既読スルーされたか？大丈夫か？',
          female: '…既読スルーされちゃったかな。大丈夫？'
        },
        choices: [
          { label: {
              male: '悪い、返信遅くなった。実はさ…',
              female: 'ごめん、返信遅くなった。実はさ…'
            }, next: null,
            effects: () => adjustPartnerRelationship(5) },
          { label: '（そのまま、既読無視を続ける）', next: null,
            effects: () => adjustPartnerRelationship(-5) }
        ]
      }
    }
  }
};
