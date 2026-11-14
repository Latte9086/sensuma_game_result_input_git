export interface FighterItem {
  id: string;
  name: string;
  englishName: string;
  kana: string; // ひらがな・検索用エイリアス
}

/**
 * スマブラSP 全ファイターリスト（No.01 マリオ 〜 No.82 ソラ）
 * 現場でのインクリメンタル検索を考慮し、ひらがな読み・略称を含めています。
 */
export const FIGHTER_ITEMS: FighterItem[] = [
  { id: '01', name: 'マリオ', englishName: "Mario", kana: 'まりお mario' },
  { id: '02', name: 'ドンキーコング', englishName: "Donkey Kong", kana: 'どんきーこんぐ dk donkey' },
  { id: '03', name: 'リンク', englishName: "Link", kana: 'りんく link' },
  { id: '04', name: 'サムス', englishName: "Samus", kana: 'さむす samus' },
  { id: '04e', name: 'ダークサムス', englishName: "Dark Samus", kana: 'だーくさむす だむす darksamus' },
  { id: '05', name: 'ヨッシー', englishName: "Yoshi", kana: 'よっしー yoshi' },
  { id: '06', name: 'カービィ', englishName: "Kirby", kana: 'かーびぃ kirby' },
  { id: '07', name: 'フォックス', englishName: "Fox", kana: 'ふぉっくす fox' },
  { id: '08', name: 'ピカチュウ', englishName: "Pikachu", kana: 'ぴかちゅう pikachu' },
  { id: '09', name: 'ルイージ', englishName: "Luigi", kana: 'るいーじ luigi' },
  { id: '10', name: 'ネス', englishName: "Ness", kana: 'ねす ness' },
  { id: '11', name: 'キャプテン・ファルコン', englishName: "Captain Falcon", kana: 'きゃぷてんふぁるこん cf falcon' },
  { id: '12', name: 'プリン', englishName: "Jigglypuff", kana: 'ぷりん jigglypuff' },
  { id: '13', name: 'ピーチ', englishName: "Peach", kana: 'ぴーち peach' },
  { id: '13e', name: 'デイジー', englishName: "Daisy", kana: 'でいじー daisy' },
  { id: '14', name: 'クッパ', englishName: "Bowser", kana: 'くっぱ bowser' },
  { id: '15', name: 'アイスクライマー', englishName: "Ice Climbers", kana: 'あいすくらいまー あいくら ics iceclimbers' },
  { id: '16', name: 'シーク', englishName: "Sheik", kana: 'しーく sheik' },
  { id: '17', name: 'ゼルダ', englishName: "Zelda", kana: 'ぜるだ zelda' },
  { id: '18', name: 'ドクターマリオ', englishName: "Dr. Mario", kana: 'どくたーまりお どくまり drmario' },
  { id: '19', name: 'ピチュー', englishName: "Pichu", kana: 'ぴちゅー pichu' },
  { id: '20', name: 'ファルコ', englishName: "Falco", kana: 'ふぁるこ falco' },
  { id: '21', name: 'マルス', englishName: "Marth", kana: 'まるす marth' },
  { id: '21e', name: 'ルキナ', englishName: "Lucina", kana: 'るきな lucina' },
  { id: '22', name: 'こどもリンク', englishName: "Young Link", kana: 'こどもりんく こりん younglink' },
  { id: '23', name: 'ガノンドロフ', englishName: "Ganondorf", kana: 'がのんどろふ がのん ganondorf' },
  { id: '24', name: 'ミュウツー', englishName: "Mewtwo", kana: 'みゅうつー mewtwo' },
  { id: '25', name: 'ロイ', englishName: "Roy", kana: 'ろい roy' },
  { id: '25e', name: 'クロム', englishName: "Chrom", kana: 'くろむ chrom' },
  { id: '26', name: 'Mr.ゲーム&ウォッチ', englishName: "Mr. Game & Watch", kana: 'みすたーげーむあんどおうぉっち げーうぉち gw gameandwatch' },
  { id: '27', name: 'メタナイト', englishName: "Meta Knight", kana: 'めたないと metaknight' },
  { id: '28', name: 'ピット', englishName: "Pit", kana: 'ぴっと pit' },
  { id: '28e', name: 'ブラックピット', englishName: "Dark Pit", kana: 'ぶらっくぴっと ぶらぴ darkpit' },
  { id: '29', name: 'ゼロスーツサムス', englishName: "Zero Suit Samus", kana: 'ぜろすーつさむす ぜろさむ zss zerosuitsamus' },
  { id: '30', name: 'ワリオ', englishName: "Wario", kana: 'わりお wario' },
  { id: '31', name: 'スネーク', englishName: "Snake", kana: 'すねーく snake' },
  { id: '32', name: 'アイク', englishName: "Ike", kana: 'あいく ike' },
  { id: '33-35', name: 'ポケモントレーナー', englishName: "Pokemon Trainer", kana: 'ぽけもんとれーなー ぽけとれ ぜにがめ ふしぎそう りざーどん pt pokemontrainer' },
  { id: '36', name: 'ディディーコング', englishName: "Diddy Kong", kana: 'でぃでぃーこんぐ diddy' },
  { id: '37', name: 'リュカ', englishName: "Lucas", kana: 'りゅか lucas' },
  { id: '38', name: 'ソニック', englishName: "Sonic", kana: 'そにっく sonic' },
  { id: '39', name: 'デデデ', englishName: "King Dedede", kana: 'ででで dedede' },
  { id: '40', name: 'ピクミン&オリマー', englishName: "Olimar", kana: 'ぴくみんあんどおりまー ぴくおり おりまー olimar' },
  { id: '41', name: 'ルカリオ', englishName: "Lucario", kana: 'るかりお lucario' },
  { id: '42', name: 'ロボット', englishName: "R.O.B.", kana: 'ろぼっと rob' },
  { id: '43', name: 'トゥーンリンク', englishName: "Toon Link", kana: 'とぅーんりんく とりん toonlink' },
  { id: '44', name: 'ウルフ', englishName: "Wolf", kana: 'うるふ wolf' },
  { id: '45', name: 'むらびと', englishName: "Villager", kana: 'むらびと villager' },
  { id: '46', name: 'ロックマン', englishName: "Mega Man", kana: 'ろっくまん megaman' },
  { id: '47', name: 'Wii Fit トレーナー', englishName: "Wii Fit Trainer", kana: 'うぃーふぃっととれーなー wiifit' },
  { id: '48', name: 'ロゼッタ&チコ', englishName: "Rosalina", kana: 'ろぜったあんどちこ ろぜちこ rosalina' },
  { id: '49', name: 'リトル・マック', englishName: "Little Mac", kana: 'りとるまっく まっく littlemac' },
  { id: '50', name: 'ゲッコウガ', englishName: "Greninja", kana: 'げっこうが greninja' },
  { id: '51', name: 'Miiファイター (格闘)', englishName: "Mii Brawler", kana: 'みーふぁいたー かくとうみー miibrawler' },
  { id: '52', name: 'Miiファイター (剣術)', englishName: "Mii Swordfighter", kana: 'みーふぁいたー けんじゅつみー miiswordfighter' },
  { id: '53', name: 'Miiファイター (射撃)', englishName: "Mii Gunner", kana: 'みーふぁいたー しゃげきみー miigunner' },
  { id: '54', name: 'パルテナ', englishName: "Palutena", kana: 'ぱるてな palutena' },
  { id: '55', name: 'パックマン', englishName: "Pac-Man", kana: 'ぱっくまん pacman' },
  { id: '56', name: 'ルフレ', englishName: "Robin", kana: 'るふれ robin' },
  { id: '57', name: 'シュルク', englishName: "Shulk", kana: 'しゅるく shulk' },
  { id: '58', name: 'クッパJr.', englishName: "Bowser Jr.", kana: 'くっぱじゅにあ bowserjr' },
  { id: '59', name: 'ダックハント', englishName: "Duck Hunt", kana: 'だっくはんと duckhunt' },
  { id: '60', name: 'リュウ', englishName: "Ryu", kana: 'りゅう ryu' },
  { id: '60e', name: 'ケン', englishName: "Ken", kana: 'けん ken' },
  { id: '61', name: 'クラウド', englishName: "Cloud", kana: 'くらうど cloud' },
  { id: '62', name: 'カムイ', englishName: "Corrin", kana: 'かむい corrin' },
  { id: '63', name: 'ベヨネッタ', englishName: "Bayonetta", kana: 'べよねった bayonetta' },
  { id: '64', name: 'インクリング', englishName: "Inkling", kana: 'いんくりんぐ inkling' },
  { id: '65', name: 'リドリー', englishName: "Ridley", kana: 'りどりー ridley' },
  { id: '66', name: 'シモン', englishName: "Simon Belmont", kana: 'しもん simon' },
  { id: '66e', name: 'リヒター', englishName: "Richter", kana: 'りひたー richter' },
  { id: '67', name: 'キングクルール', englishName: "King K. Rool", kana: 'きんぐくるーる くるーる krool' },
  { id: '68', name: 'しずえ', englishName: "Isabelle", kana: 'しずえ isabelle' },
  { id: '69', name: 'ガオガエン', englishName: "Incineroar", kana: 'がおがえん incineroar' },
  { id: '70', name: 'パックンフラワー', englishName: "Piranha Plant", kana: 'ぱっくんふらわー piranhaplant' },
  { id: '71', name: 'ジョーカー', englishName: "Joker", kana: 'じょーかー joker' },
  { id: '72', name: '勇者', englishName: "Hero", kana: 'ゆうしゃ hero' },
  { id: '73', name: 'バンジョー&カズーイ', englishName: "Banjo-Kazooie", kana: 'ばんじょーあんどかずーい ばんかず banjo' },
  { id: '74', name: 'テリー', englishName: "Terry", kana: 'てりー terry' },
  { id: '75', name: 'ベレト / ベレス', englishName: "Byleth", kana: 'べれと べれす byleth' },
  { id: '76', name: 'ミェンミェン', englishName: "Min Min", kana: 'みぇんみぇん めんめん minmin' },
  { id: '77', name: 'スティーブ / アレックス', englishName: "Steve", kana: 'すてぃーぶ あれっくす steve' },
  { id: '78', name: 'セフィロス', englishName: "Sephiroth", kana: 'せふぃろす sephiroth' },
  { id: '79-80', name: 'ホムラ / ヒカリ', englishName: "Pyra & Mythra", kana: 'ほむら ひかり ほむひか pyra mythra aegis' },
  { id: '81', name: 'カズヤ', englishName: "Kazuya", kana: 'かずや kazuya' },
  { id: '82', name: 'ソラ', englishName: "Sora", kana: 'そら sora' },
];

export const FIGHTERS: string[] = FIGHTER_ITEMS.map((f) => f.name);

/**
 * 大会主要ステージリスト
 */
export const STAGE_ENGLISH_NAMES: Record<string, string> = {
  "終点": "Final Destination",
  "戦場": "Battlefield",
  "小戦場": "Small Battlefield",
  "ポケモンスタジアム2": "Pokémon Stadium 2",
  "すま村": "Smashville",
  "村と街": "Town and City",
  "ホロウバスティオン": "Hollow Bastion",
  "カルロスポケモンリーグ": "Kalos Pokémon League",
  "ヨッシーストーリー": "Yoshi's Story"
};

export const STAGES = Object.keys(STAGE_ENGLISH_NAMES);

/**
 * トーナメントサイド選択肢
 */
export const BRACKET_SIDES = ['Winners', 'Losers'] as const;
export type BracketSide = (typeof BRACKET_SIDES)[number];

/**
 * ラウンド選択肢
 */
export const ROUNDS: string[] = [
  'R1',
  'R2',
  'R3',
  'R4',
  'R5',
  'Top 64',
  'Top 32',
  'Top 16',
  'Top 8',
  '準々決勝 (QF)',
  '準決勝 (SF)',
  '決勝 (WF / LF)',
  'Grand Finals',
  'Grand Finals Reset',
  'Pool',
  'その他',
];

