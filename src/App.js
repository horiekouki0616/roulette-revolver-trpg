






import { globalStyles } from './Styles';
import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { 
  collection, getDocs, addDoc, doc, onSnapshot, 
  updateDoc, setDoc, serverTimestamp, deleteDoc, getDoc // ★getDocを追加
} from "firebase/firestore";

const BULLET_TYPES = {
  "通常弾": { 
    hit_rate: 90, 
    power: 3, 
    cost: 1, 
    effect: "標準的な弾丸。命中率が高い。" 
  },
  "ダムダム弾": { 
    hit_rate: 80, 
    power: 4, 
    cost: 2, 
    effect: "強力な弾丸。威力が高い。" 
  },
  "急所弾": { 
    hit_rate: 80, 
    power: 3, 
    cost: 3, 
    effect: "シールドとディフェンスを無視してHPに直接ダメージを与える。" 
  },
  "防御貫通弾": { 
    hit_rate: 80, 
    power: 3, 
    cost: 2, 
    effect: "ターゲットのディフェンスを無視してダメージ計算を行う。" 
  },
  "レーザー弾": { 
    hit_rate: 100, 
    power: 2, 
    cost: 1, 
    effect: "百発百中だが、威力が低い。" 
  },
  "対物弾": { 
    hit_rate: 33, 
    power: 6, 
    cost: 2, 
    effect: "命中率は低いが、威力がとても高い。" 
  },
  "ギャンブル弾": { 
    hit_rate: 80, 
    power: 1, 
    cost: 2, 
    effect: "シリンダー内の残弾数が少ないほど威力が上がる。(シリンダーの「空」の数＝ダメージ)" 
  },
  "ファニング弾": { 
    hit_rate: 90, 
    power: 3, 
    cost: 4, 
    effect: "シリンダースロット1にのみ設定可能。\nシリンダーがフルの状態でこの弾薬がセットされた場合、命中率90%の攻撃を6回行う。当たった回数×1ダメージを与え、その後シリンダーは空になる。\nシリンダーがフルでない状態でこの弾薬がセットされた場合、通常弾と同じ効果で発射される。" 
  },
  "エクストラ弾": { 
    hit_rate: 90, 
    power: 3, 
    cost: 4, 
    effect: "シリンダースロット1にのみ設定可能。\nこの弾薬でダメージを与えた場合、もう一度行動出来る。" 
   },
    "ドレイン弾": { 
    hit_rate: 90, 
    power: 2, 
    cost: 4, 
    effect: "シリンダースロット1にのみ設定可能。\nシールドとディフェンスを無視してHPに直接ダメージを与える。この弾薬でダメージを与えた場合、自分のPCは相手のHPに与えたダメージ分だけ回復する。" 
  },
  "空": { 
    hit_rate: 0, 
    power: 0, 
    cost: 0, 
    effect: "弾が入っていない状態。" 
  },
  "特殊弾": { 
    hit_rate: 100, 
    power: 0, 
    cost: 0, 
    effect: "キャラメイク時選択不可 シナリオオリジナル弾薬用" 
  }
};

const INITIAL_SKILLS = {
  身体: 0,
  知識: 0,
  信用: 0,
  調査: 0,
  隠匿: 0,
  直観: 0
};

const SLOT1_ONLY_BULLETS = ["ファニング弾", "エクストラ弾", "ドレイン弾"];

const SPECIAL_MOVES = {
  "回避": "攻撃を受けた際、無効化する。",
  "追加射撃": "通常行動の終了後、追加でもう一度だけ射撃アクションを行える。",
  "強化弾": "トリガー前に宣言可能。次の射撃に限り、弾丸威力を+2する。命中しなかった場合、次のターン以降再度宣言出来る。",
  "反撃": "自分が攻撃を受けた時宣言可能、ダメージを受けた直後に、ダメージを与えてきた相手に即座に1回射撃を行いリロードする。",
  "装甲修復": "ターン開始時宣言可能。シールドを2回復する。",
  "レボリューションリロード": "この必殺技は戦闘中2回まで発動できる。ターン開始時宣言可能。ターンを消費せずに即座にリロードする。"
};

function App() {


  const [editingMemberIndex, setEditingMemberIndex] = useState(null);
  const [editMemberData, setEditMemberData] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [log, setLog] = useState([]);
  const [hitEffect, setHitEffect] = useState(null); 
  const [selectedTargets, setSelectedTargets] = useState({});
  
  const [menuMode, setMenuMode] = useState('menu');
  const [battleMembers, setBattleMembers] = useState([]);
  const [isBattleActive, setIsBattleActive] = useState(false);
  const [lastDamage, setLastDamage] = useState(0);
  const [editingCharacter, setEditingCharacter] = useState(null);
  const [currentRoomId, setCurrentRoomId] = useState(null); // ★追加
  const [shareUrl, setShareUrl] = useState("");
  const [isGuest, setIsGuest] = useState(false);
  const [myCharId, setMyCharId] = useState(null);
  const isGM = !isGuest;
  const [activeSpecialMove, setActiveSpecialMove] = useState(null);

  const triggerSpecialMove = async (memberIndex) => {
    if (!currentRoomId) return;
    const battleRef = doc(db, "battles", currentRoomId);
    const performer = battleMembers[memberIndex];
    if (!performer || !performer.specialMove) {
      alert("必殺技が設定されていません");
      return;
    }

    const moveName = performer.specialMove;
    const newLogEntry = `${performer.name}：必殺技【${moveName}】発動！`;

    await updateDoc(battleRef, {
      activeSpecialMove: {
        performerIndex: memberIndex,
        moveName: moveName,
        timestamp: Date.now()
      },
      log: [newLogEntry, ...log]
    });
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomIdFromUrl = params.get('room');

    if (roomIdFromUrl) {
      setCurrentRoomId(roomIdFromUrl);
      setShareUrl(window.location.href);
      setIsGuest(true);
      setMenuMode('load');
    }
  }, []);

  // ★追加：GM用 部屋作成・URL生成関数
  const createRoom = async () => {
    const roomRef = doc(collection(db, "battles"));
    const newRoomId = roomRef.id;

    await setDoc(roomRef, {
      members: [],
      isBattleActive: false,
      log: ["部屋が作成されました"],
      createdAt: serverTimestamp()
    });

    const generatedUrl = `${window.location.origin}${window.location.pathname}?room=${newRoomId}`;
    setShareUrl(generatedUrl);
    setCurrentRoomId(newRoomId);

    fetchCharacters(newRoomId);

    // URLをクリップボードにコピー
    if (navigator.clipboard) {
      navigator.clipboard.writeText(generatedUrl);
      alert("部屋を作成しました！招待URLをコピーしました！");
    }

    setMenuMode('load');
  };

  const fetchCharacters = async (targetRoomId = currentRoomId) => {
    if (!targetRoomId) return;
    const querySnapshot = await getDocs(collection(db, "battles", targetRoomId, "roomCharacters"));
    const chars = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setCharacters(chars);
  };


  const playSound = (type) => {
    const soundMap = {
      fire: 'fire.mp3',
      reload: 'reload.mp3',
      special: 'special.mp3',
    };
    const fileName = soundMap[type] || 'empty.mp3';
    const audio = new Audio(`/sounds/${fileName}`);
    audio.volume = 0.5;
    audio.play().catch(e => console.error("Error:", e));
  };

  const adjustStat = async (memberIndex, stat, amount) => {
      if (!currentRoomId) return;
      const battleRef = doc(db, "battles", currentRoomId);
      
      const updatedMembers = battleMembers.map(m => {
        const { createdAt, ...rest } = m;
        return JSON.parse(JSON.stringify(rest));
      });
      
      const member = updatedMembers[memberIndex];
      const maxValue = stat === 'hp' ? member.maxHp : member.maxShield;
      const newValue = (member[stat] || 0) + amount;
  
      member[stat] = Math.max(0, Math.min(newValue, maxValue || 999));

      if (stat === 'shield' && member[stat] === 0) {
        member.defense = 0;
      }
      await updateDoc(battleRef, { members: updatedMembers });
    };

  // キャラ作成用
  const [newCharName, setNewCharName] = useState("");
  const [newBullets, setNewBullets] = useState(Array(6).fill({ name: "空", ...BULLET_TYPES["空"] }));
  const [combatPoints, setCombatPoints] = useState(24);
  const [explorePoints, setExplorePoints] = useState(12);
  const [stats, setStats] = useState({ hp: 15, shield: 5, defense: 0 });
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [skills, setSkills] = useState(INITIAL_SKILLS);
  const [selectedSpecialMove, setSelectedSpecialMove] = useState("");

  
  const copyToSessionTool = (charData) => {
    const SessionToolData = {
      kind: "character",
      data: {
        name: charData.name || "名称未設定",
        memo: `PL：\nHO：`,
        params: Object.entries(charData.skills || {}).map(([k, v]) => ({ label: k, value: String(v) })),
        commands: `2d6+{身体} [身体]\n2d6+{知識} [知識]\n2d6+{信用} [信用]\n2d6+{調査} [調査]\n2d6+{隠匿} [隠匿]\n2d6+{直観} [直観]`
      }
    };

    navigator.clipboard.writeText(JSON.stringify(SessionToolData))
      .then(() => alert("セッションツール用データをコピーしました！"))
      .catch(() => alert("コピーに失敗しました"));
  };

  

  // Firestore監視

  useEffect(() => {
    document.title = "ルーレットリボルバーTRPG";
    const styleSheet = document.createElement("style");
    styleSheet.innerText = globalStyles;
    document.head.appendChild(styleSheet);

    if (!currentRoomId) return; // ★部屋IDがない時は監視しない

    fetchCharacters();

    const unsub = onSnapshot(doc(db, "battles", currentRoomId), (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      const newLog = data.log || [];
      const newMembers = data.members || [];

      setHitEffect(data.hitEffect || null);
      
      // 必殺技の発動状態を監視して、発動から2秒後に消去するタイマーを設定
      if (data.activeSpecialMove) {
        const { performerIndex, moveName, timestamp } = data.activeSpecialMove;
        const now = Date.now();
        const elapsed = now - (timestamp || now);
        if (elapsed < 2000) {
          setActiveSpecialMove({ performerIndex, moveName });
          if (window.specialMoveTimer) clearTimeout(window.specialMoveTimer);
          window.specialMoveTimer = setTimeout(() => {
            setActiveSpecialMove(null);
          }, 2000 - elapsed);
        } else {
          setActiveSpecialMove(null);
        }
      } else {
        setActiveSpecialMove(null);
      }

      setLog((prevLog) => {
        if (newLog.length > 0 && newLog[0] !== prevLog[0]) {
          const latest = newLog[0];
          
          // ログの内容ば見て全員のブラウザで音ば鳴らす
          if (latest.includes("命中")) {
            playSound("fire");
            //setHitEffect(true);
            setTimeout(() => setHitEffect(false), 3000);
          } 
          else if (latest.includes("外れて")) playSound("fire");
          else if (latest.includes("空だ") || latest.includes("不発")) playSound("empty");
          else if (latest.includes("セット！") || latest.includes("完了")) playSound("reload");
          else if (latest.includes("必殺技")) playSound("special");
        }
        return newLog;
      });

      // 状態（メンバーの変化）ば見て音ば鳴らす
      setBattleMembers((prevMembers) => {
        newMembers.forEach((member, idx) => {
          const prevMember = prevMembers[idx];

          // 1. スピン音（isSpinningがtrueになった瞬間からタイマー開始）
          if (member.isSpinning && !member.isReloading && (!prevMember || !prevMember.isSpinning)) {
            window[`spinTimer_${idx}`] = setInterval(() => playSound("empty"), 50);
          }
          // スピン停止
          if (!member.isSpinning && prevMember?.isSpinning) {
            clearInterval(window[`spinTimer_${idx}`]);
          }

          // 2. リロード音（activeChamberが変わるたびに1回鳴らす）
          if (member.isReloading && prevMember && member.activeChamber !== prevMember.activeChamber) {
            playSound("empty");
          }
        });
        return newMembers;
      });

      setIsBattleActive(data.isBattleActive || false);
    });
    return () => unsub();
  }, [currentRoomId]);

  

  const updateStat = (type, amount) => {
      const costs = { hp: 1, shield: 2, defense: 5 };
      const cost = costs[type];
      if (amount > 0 && combatPoints >= cost) {
        setStats(prev => ({ ...prev, [type]: prev[type] + 1 }));
        setCombatPoints(combatPoints - cost);
      } else if (amount < 0) {
        const minValues = { hp: 1, shield: 0, defense: 0 };
        if (stats[type] > minValues[type]) {
          setStats({ ...stats, [type]: stats[type] - 1 });
          setCombatPoints(combatPoints + cost);
        }
      }
    };

  const updateSkill = (skillName, amount) => {
      if (amount > 0) {
        if (skills[skillName] >= 6) {
          alert("一つの技能に割り振れる上限は6ポイントまでです");
          return;
        }
        if (explorePoints >= 1) {
          setSkills(prev => ({ ...prev, [skillName]: prev[skillName] + 1 }));
          setExplorePoints(explorePoints - 1);
        }
      } else if (amount < 0 && skills[skillName] > 0) {
        setSkills(prev => ({ ...prev, [skillName]: prev[skillName] - 1 }));
        setExplorePoints(explorePoints + 1);
      }
    };

  const saveCharacter = async () => {
    if (!newCharName.trim()) {
      alert("名前を入力してください");
      return;
    }
    if (!selectedSpecialMove) {
      alert("必殺技を選択してください");
      return;
    }
    if (combatPoints < 0 || explorePoints < 0) {
      alert("ポイントがオーバーしています！");
      return;
    }
    try {
      const charData = { 
          name: newCharName, 
          bullets: newBullets,
          hp: stats.hp,
          maxHp: stats.hp,
          shield: stats.shield,
          maxShield: stats.shield,
          defense: stats.defense,
          skills: skills,
          specialMove: selectedSpecialMove,
          createdAt: serverTimestamp(),
          expireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        };
      await addDoc(collection(db, "battles", currentRoomId, "roomCharacters"), charData);
      fetchCharacters();
      setNewCharName("");
      setNewBullets(Array(6).fill({ name: "空", ...BULLET_TYPES["空"] }));
      setStats({ hp: 15, shield: 5, defense: 0 });
      setSkills(INITIAL_SKILLS);
      setSelectedSpecialMove("");
      setCombatPoints(24);
      setExplorePoints(12);
      setMenuMode('load');
      alert("登録完了！");
    } catch (e) {
      alert("保存に失敗しました！");
    }
  };


  const resetLocks = async () => {
    if (!currentRoomId) return;
    const battleRef = doc(db, "battles", currentRoomId);
    const updatedMembers = battleMembers.map(m => ({
      ...m,
      isSpinning: false,
      isReloading: false
    }));
    await updateDoc(battleRef, { members: updatedMembers });
    alert("ロック状態を解除しました！");
  };

  const openEditModal = (index) => {
  setEditingMemberIndex(index);
  setEditMemberData(JSON.parse(JSON.stringify(battleMembers[index])));
};

  const saveEditedMember = async () => {
    if (!currentRoomId || editingMemberIndex === null) return;
    const battleRef = doc(db, "battles", currentRoomId);

    const updatedMembers = battleMembers.map(m => {
      const { createdAt, ...rest } = m;
      return JSON.parse(JSON.stringify(rest));
    });

    updatedMembers[editingMemberIndex] = editMemberData;

    await updateDoc(battleRef, {
      members: updatedMembers,
      log: [`${editMemberData.name}のステータス/装備が更新された！`, ...log]
    });

    setEditingMemberIndex(null);
    setEditMemberData(null);
  };

  const spinCylinder = async (memberIndex) => {
    if (!currentRoomId) return;

    const targetIndex = selectedTargets["current"]; 
    if (targetIndex === undefined) {
      alert("ターゲットを選択してください");
      return;
    }

    const battleRef = doc(db, "battles", currentRoomId);
    if (battleMembers.some(m => m.isSpinning)) return;

    const playSpinSound = () => {
      const s = new Audio("/sounds/empty.mp3");
      s.volume = 0.5;
      s.play().catch(() => {});
    };
    if (window[`spinTimer_${memberIndex}`]) clearInterval(window[`spinTimer_${memberIndex}`]);
    window[`spinTimer_${memberIndex}`] = setInterval(playSpinSound, 50);

    const spinningMembers = [...battleMembers];
    spinningMembers[memberIndex].isSpinning = true;
    await updateDoc(battleRef, { members: spinningMembers });

    setTimeout(async () => {


        if (window[`spinTimer_${memberIndex}`]) {
        clearInterval(window[`spinTimer_${memberIndex}`]);
        window[`spinTimer_${memberIndex}`] = null;
      }
      
      const finalChamber = Math.floor(Math.random() * 6);
      const updatedMembers = JSON.parse(JSON.stringify(battleMembers));
      const member = updatedMembers[memberIndex];
      const setBullet = member.bullets[finalChamber];
      
      updatedMembers[memberIndex] = { 
        ...member, 
        isSpinning: false, 
        activeChamber: finalChamber,
        hasSetChamber: true 
      };

      await updateDoc(battleRef, { 
        members: updatedMembers,
        log: [`${member.name}：セット！\n ${finalChamber + 1}番！${setBullet.name}だ！`, ...log]
      });
    }, 1000);
  };

  // ★ヒットエフェクト発火＆3秒後の自動消去処理を追加
  const triggerShotEffect = async (targetIndex, damage = null) => {
  const battleRef = doc(db, "battles", currentRoomId);

  // 全員にエフェクトとダメージ（nullならMISS）を共有
  await updateDoc(battleRef, {
    hitEffect: { targetIndex, damage }
  });

  // 3秒後にエフェクト状態をクリア
  setTimeout(async () => {
    await updateDoc(battleRef, { hitEffect: null });
  }, 3000);
};

  const pullTrigger = async (memberIndex) => {
    if (!currentRoomId) return;
    const targetIndex = selectedTargets["current"]; 
    if (targetIndex === undefined) {
      alert("ターゲットを選択してください");
      return;
    }

    const battleRef = doc(db, "battles", currentRoomId);
    
    const updatedMembers = battleMembers.map(m => {
      const { createdAt, ...rest } = m;
      return JSON.parse(JSON.stringify(rest));
    });

    const currentMember = updatedMembers[memberIndex];
    if (!currentMember.hasSetChamber) return;
    
    const target = updatedMembers[targetIndex];
    if (!target) {
      alert("有効なターゲットを選択してください");
      return;
    }

    const chamber = currentMember.activeChamber;
    const bullet = currentMember.bullets[chamber];
    let newLogEntry = "";

    // 弾が入っているか判定（"空" 以外、かつオブジェクトが存在するか）
    if (bullet && bullet.name && bullet.name !== "空") {

      // ==========================================
      // ① ギャンブル弾の処理
      // ==========================================
      if (bullet.name === "ギャンブル弾") {
          const randomVal = Math.floor(Math.random() * 100);
          const hitSuccess = randomVal < bullet.hit_rate;

          if (hitSuccess) {
            const emptyCount = currentMember.bullets.filter(
              b => !b || !b.name || b.name === "空"
            ).length;

            let rawDamage = emptyCount + 1;
            let currentDmg = rawDamage;
            let logDetails = [];

            logDetails.push(`${target.name}に${rawDamage}ダメージの攻撃！`);

            // ディフェンス減算
            if ((target.shield || 0) > 0 && (target.defense || 0) > 0) {
              const defReduced = Math.min(currentDmg - 1, target.defense);
              if (defReduced > 0) {
                currentDmg -= defReduced;
              }
            }

            // シールド計算
            if ((target.shield || 0) > 0) {
              const shieldBlocked = Math.min(target.shield, currentDmg);
              target.shield -= shieldBlocked;
              currentDmg -= shieldBlocked;
            }

            // HP計算
            if (currentDmg > 0) {
              target.hp = Math.max(0, target.hp - currentDmg);
            }

            setLastDamage(rawDamage);
            newLogEntry = `${currentMember.name}：\nギャンブル弾命中！(出目:${randomVal + 1} <= ${bullet.hit_rate}%) (空:${emptyCount + 1})\n` + logDetails.join('\n');

            // ★命中エフェクト発火を拡張した関数に変更
            triggerShotEffect(targetIndex, rawDamage);
            setSelectedTargets({});

          } else {
            newLogEntry = `${currentMember.name}：ギャンブル弾は外れてしまった… (出目:${randomVal + 1} > ${bullet.hit_rate}%)`;
            setSelectedTargets({});
            // ★MISSエフェクト発火を追加
            triggerShotEffect(targetIndex, null);
          }
        } 
        // ==========================================
        // ② ファニング弾の処理
        // ==========================================
        else if (bullet.name === "ファニング弾") {
          const isFull = currentMember.bullets.every(
            b => b && b.name && b.name !== "空"
          );

          if (isFull) {
            for (let i = 0; i < 6; i++) {
              setTimeout(() => playSound("fire"), i * 200);
            }
            let hitCount = 0;
            let totalShieldBlocked = 0;
            let totalHpDamage = 0;
            let rolls = [];

            for (let i = 0; i < 6; i++) {
              const randomVal = Math.floor(Math.random() * 100);
              const hitSuccess = randomVal < 90;
              rolls.push(randomVal);
              if (hitSuccess) {
                hitCount++;
                if ((target.shield || 0) > 0) {
                  target.shield -= 1;
                  totalShieldBlocked += 1;
                } else {
                  target.hp = Math.max(0, target.hp - 1);
                  totalHpDamage += 1;
                }
              }
            }

            let logDetails = [];
            logDetails.push(`出目: [${rolls.join(', ') + 1}] (命中率: 90%)`);
            if (hitCount > 0) {
              logDetails.push(`${target.name}に6発中${hitCount}発命中！ (合計${hitCount}ダメージ)`);
            } else {
              logDetails.push(`6発全て外れてしまった…！`);
            }

            setLastDamage(hitCount);
            currentMember.bullets = Array(6).fill({ name: "空", hit_rate: 0, power: 0, effect: "なし" });

            newLogEntry = `${currentMember.name}：\nファニングショット！！\n` + logDetails.join('\n') + `\nシリンダーは空になった！`;

            // ★命中エフェクト発火を拡張した関数に変更
            triggerShotEffect(targetIndex, hitCount);
            setSelectedTargets({});



          } else {
              const randomVal = Math.floor(Math.random() * 100);
              const hitSuccess = randomVal < bullet.hit_rate;

              if (hitSuccess) {
                let rawDamage = bullet.power;
                let currentDmg = rawDamage;
                let logDetails = [];

                logDetails.push(`${target.name}に${rawDamage}ダメージ！`);

                // ディフェンス減算（シールドがある場合）
                if ((target.shield || 0) > 0 && (target.defense || 0) > 0) {
                  const defReduced = Math.min(currentDmg - 1, target.defense);
                  if (defReduced > 0) {
                    currentDmg -= defReduced;
                  }
                }

                // シールド吸収
                if ((target.shield || 0) > 0) {
                  const shieldBlocked = Math.min(target.shield, currentDmg);
                  target.shield -= shieldBlocked;
                  currentDmg -= shieldBlocked;
                }

                // HP減算
                if (currentDmg > 0) {
                  target.hp = Math.max(0, target.hp - currentDmg);
                }

                setLastDamage(rawDamage);
                newLogEntry = `${currentMember.name}：\n${bullet.name}命中！ (出目:${randomVal + 1} <= 命中率:${bullet.hit_rate}%)\n` + logDetails.join('\n');

                // ★命中エフェクト発火を拡張した関数に変更
                triggerShotEffect(targetIndex, rawDamage);
                setSelectedTargets({});

              } else {
                newLogEntry = `${currentMember.name}：${bullet.name}は外れてしまった… (出目:${randomVal + 1} > 命中率:${bullet.hit_rate}%)`;
                setSelectedTargets({}); 
                // ★MISSエフェクト発火を追加
                triggerShotEffect(targetIndex, null);
              }
              currentMember.bullets[chamber] = { name: "空", hit_rate: 0, power: 0, effect: "なし" };
            }
        } 
        // ==========================================
        // ③ 通常弾・その他の特殊弾の処理
        // ==========================================
        else {
          const randomVal = Math.floor(Math.random() * 100);
          const hitSuccess = randomVal < bullet.hit_rate;

          if (hitSuccess) {
            let rawDamage = bullet.power;
            let currentDmg = rawDamage;
            let logDetails = [];

            logDetails.push(`${target.name}に${rawDamage}ダメージ！`);

            if (bullet.name === "急所弾" || bullet.name === "ドレイン弾") {
              logDetails.push(`${bullet.name === "急所弾" ? "急所弾" : "ドレイン弾"}！シールド・ディフェンス無視！`);
              target.hp = Math.max(0, target.hp - currentDmg);
              logDetails.push(`HPに${currentDmg}ダメージ！`);

              if (bullet.name === "ドレイン弾" && currentDmg > 0) {
                currentMember.hp = Math.min(currentMember.maxHp || 15, (currentMember.hp || 0) + 2);
                logDetails.push(`ドレイン！${currentMember.name}のHPが回復！！`);
              }
            } else {
              // ディフェンス減算（シールドがある場合かつ防御貫通弾でない場合）
              if (bullet.name !== "防御貫通弾" && (target.shield || 0) > 0 && (target.defense || 0) > 0) {
                const defReduced = Math.min(currentDmg - 1, target.defense);
                if (defReduced > 0) {
                  currentDmg -= defReduced;
                }
              } else if (bullet.name === "防御貫通弾") {
                logDetails.push(`防御貫通！ディフェンス無視！`);
              }

              // シールド吸収
              if ((target.shield || 0) > 0) {
                const shieldBlocked = Math.min(target.shield, currentDmg);
                target.shield -= shieldBlocked;
                currentDmg -= shieldBlocked;
              }

              // HP減算
              if (currentDmg > 0) {
                target.hp = Math.max(0, target.hp - currentDmg);
              }
            }

            if (bullet.name === "エクストラ弾") {
              logDetails.push(`エクストラ弾効果発動！もう一度行動できる！`);
            }

            setLastDamage(rawDamage);
            newLogEntry = `${currentMember.name}：\n${bullet.name}命中！ (出目:${randomVal + 1} <= ${bullet.hit_rate}%)\n` + logDetails.join('\n');

            // ★命中エフェクト発火を拡張した関数に変更
            triggerShotEffect(targetIndex, rawDamage);
            setSelectedTargets({});

          } else {
            newLogEntry = `${currentMember.name}：${bullet.name}は外れてしまった… (出目:${randomVal + 1} > ${bullet.hit_rate}%)`;
            setSelectedTargets({}); 
            // ★MISSエフェクト発火を追加
            triggerShotEffect(targetIndex, null);
          }
        }

      // 弾の消費処理
      if (bullet.name !== "ファニング弾") {
        currentMember.bullets[chamber] = { name: "空", hit_rate: 0, power: 0, effect: "なし" };
      }
    } else {
      newLogEntry = `${currentMember.name}：${chamber + 1}番は空だ！`;
      setSelectedTargets({}); 
    }

    currentMember.hasSetChamber = false;
    await updateDoc(battleRef, { 
      members: updatedMembers, 
      log: [newLogEntry, ...log] 
    });
  }

  const editChamber = async (memberIndex, holeIndex) => {
    const battleRef = doc(db, "battles", currentRoomId);
    
    const updatedMembers = battleMembers.map(m => {
      const { createdAt, ...rest } = m; 
      return JSON.parse(JSON.stringify(rest));
    });

    const member = updatedMembers[memberIndex];
    const typeNames = Object.keys(BULLET_TYPES);
    const currentName = member.bullets[holeIndex].name;
    const currentIndex = typeNames.indexOf(currentName);
    
    const nextIndex = (currentIndex + 1) % typeNames.length;
    const nextName = typeNames[nextIndex];
    
    // スロット1以外の場合、専用弾薬をスキップする
    if (holeIndex !== 0) {
      while (SLOT1_ONLY_BULLETS.includes(nextName)) {
        nextIndex = (nextIndex + 1) % typeNames.length;
        nextName = typeNames[nextIndex];
      }
    }

    member.bullets[holeIndex] = { 
      name: nextName, 
      ...BULLET_TYPES[nextName] 
    };

    await updateDoc(battleRef, { 
      members: updatedMembers,
      log: [`${member.name}の${holeIndex + 1}番を${nextName}に換装した！`, ...log]
    });
    playSound("reload");
  };

  const reloadChar = async (memberIndex) => {
    if (!currentRoomId) return;
    const battleRef = doc(db, "battles", currentRoomId);

    if (battleMembers[memberIndex].isSpinning || battleMembers[memberIndex].isReloading) return;
    const original = characters.find(c => c.id === battleMembers[memberIndex].id);
    if (!original) return;

    // 1. まずリロード開始状態（全空）にする
    const startMembers = [...battleMembers];
    startMembers[memberIndex] = { 
      ...startMembers[memberIndex], 
      isSpinning: true, 
      isReloading: true, 
      bullets: Array(6).fill({ name: "空", hit_rate: 0, power: 0, effect: "なし" }) 
    };
    await updateDoc(battleRef, { members: startMembers });

    let currentIdx = 5; 
    const reloadInterval = setInterval(async () => {
      const docRef = doc(db, "battles", currentRoomId);
      const snap = await getDoc(docRef); // ★ currentRoomId のドキュメントを取得する
      if (!snap.exists()) return;
      const currentData = snap.data();
      const currentMembers = [...currentData.members];
      
      const newBullets = [...currentMembers[memberIndex].bullets];
      newBullets[currentIdx] = { ...original.bullets[currentIdx] };

      currentMembers[memberIndex] = {
        ...currentMembers[memberIndex],
        bullets: newBullets,
        activeChamber: currentIdx
      };

      await updateDoc(battleRef, { members: currentMembers });
      

      if (currentIdx === 0) {
        clearInterval(reloadInterval);
        const finalMembers = [...currentMembers];
        finalMembers[memberIndex].isSpinning = false;
        finalMembers[memberIndex].isReloading = false;
        await updateDoc(battleRef, { 
          members: finalMembers,
          log: [`${original.name}が装填完了した！`, ...currentData.log]
        });
      } else {
        currentIdx--;
      }
    }, 400);
  };


  if (menuMode === 'battle') {
    return (
      // 画面全体の背景を木製テーブルに設定！
      <div style={{ 
        padding: '30px', 
        color: '#fff', 
        textAlign: 'center', 
        minHeight: '100vh', 
        position: 'relative', 
        overflow: 'hidden',
        backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png"), linear-gradient(to bottom right, #5d4037, #2d1b0f)', // 木目テクスチャとグラデーション
        backgroundSize: 'auto, cover',
        backgroundAttachment: 'fixed'
      }}>
        {/* ★1. 画面全体のフラッシュ（ここに配置） */}
        {hitEffect && <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, pointerEvents: 'none' }} className="hit-flash" />}
        
        {activeSpecialMove && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            pointerEvents: 'none',
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{
              fontSize: '1.8rem',
              color: '#ffd700',
              letterSpacing: '4px',
              textShadow: '2px 2px 4px #000',
              marginBottom: '10px'
            }}>
              {battleMembers[activeSpecialMove.performerIndex]?.name || ""}
            </div>
            <div style={{
              fontSize: '4.5rem',
              fontWeight: '900',
              color: '#fff',
              textShadow: '0 0 20px #ff0000, 0 0 40px #ffd700, 3px 3px 0 #000',
              padding: '20px 60px',
              borderTop: '4px solid #ffd700',
              borderBottom: '4px solid #ffd700',
              background: 'linear-gradient(90deg, transparent, rgba(139, 0, 0, 0.8), transparent)',
              whiteSpace: 'nowrap',
              transform: 'scale(1.1)',
              animation: 'pulse 0.8s infinite alternate'
            }}>
              【{activeSpecialMove.moveName}】
            </div>
          </div>
        )}

        <h2 style={{ marginBottom: '40px', color: '#b8860b', textShadow: '3px 3px #000', letterSpacing: '5px', fontSize: '2.5rem', fontFamily: 'Metal Mania, cursive', textTransform: 'uppercase' }}>
          ROULETTE REVOLVER
        </h2>
        
       <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', flexWrap: 'wrap' }}>
          {battleMembers.map((member, index) => {
            const isMyCharacter = member.instanceId === myCharId;
            const isTargeted = selectedTargets["current"] === index;
            // ★2. 被弾ターゲットの判定変数をここに追加
            const isHitTarget = hitEffect && hitEffect.targetIndex === index;
            const isDead = member.hp <= 0;

            return (
              <div 
                key={index} 
                className="parchment-card"
                style={{ 
                  width: '280px',
                  position: 'relative',
                  outline: isTargeted ? '4px solid #8b0000' : 'none',
                  outlineOffset: '5px',
                  // HPが0の場合はグレーアウトして半透明にする
                  opacity: isDead ? 0.4 : 1,
                  filter: isDead ? 'grayscale(100%)' : 'none',
                  transition: 'all 0.3s ease'
                }}
                onClick={() => {
                  if (!isDead) {
                    setSelectedTargets({ "current": index });
                  }
                }}
              >
              
                {/* ★3. 照準と被弾エフェクト表示部（元の照準表示を丸ごとこれに差し替え） */}
                {(isTargeted || isHitTarget) && (
                  <div 
                    className={isHitTarget ? "reticle-shot" : "reticle-active"}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px'
                    }}
                  >
                    <span>{isHitTarget ? (hitEffect.damage === null ? "" : "💥") : "🎯"}</span>

                    {/* 被弾時のダメージ数字またはMISS表示 */}
                    {isHitTarget && (hitEffect.damage > 0 || hitEffect.damage === null) && (
                      <span style={{
                        fontSize: hitEffect.damage === null ? '24px' : '30px',
                        color: hitEffect.damage === null ? '#ffffff' : '#fff',
                        fontWeight: 'bold',
                        textShadow: '1px 1px 0 #000',
                        animation: 'damageFloat 3s forwards'
                      }}>
                        {hitEffect.damage === null ? "MISS" : hitEffect.damage}
                      </span>
                    )}
                  </div>
                )}

                <h3 style={{ margin: '0 0 20px 0', borderBottom: '2px solid #3d2b1f', paddingBottom: '10px', color: '#5d4037', fontSize: '1.8rem' }}>
                  {member.name} {isMyCharacter && "(YOU)"}
                </h3>

                {(isMyCharacter || isGM) && (
                  <button 
                    className="brass-button" 
                    onClick={(e) => { e.stopPropagation(); openEditModal(index); }}
                    style={{ padding: '4px 8px', fontSize: '0.75rem', background: '#3d2b1f' }}
                  >
                    ⚙ EDIT
                  </button>
                )}

                {/* ステータスエリア */}
                {(isMyCharacter || isGM) && (
                  <div style={{ textAlign: 'left', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '40px' }}>
                    {/* SHIELD表示 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span>SHIELD: <span style={{ color: '#007bff' }}>{member.shield}</span></span>
                      <div>
                        <button className="brass-button" onClick={(e) => { e.stopPropagation(); adjustStat(index, 'shield', 1); }} style={{ padding: '3px 8px', fontSize: '0.8rem', marginRight: '5px' }}>+</button>
                        <button className="brass-button" onClick={(e) => { e.stopPropagation(); adjustStat(index, 'shield', -1); }} style={{ padding: '3px 8px', fontSize: '0.8rem' }}>-</button>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: '#3d2b1f', marginBottom: '15px', border: '1px solid #000' }}>
                      <div style={{ 
                          width: `${(member.shield / (member.maxShield || 10)) * 100}%`, 
                          height: '100%', 
                          background: '#00bfff' 
                        }} />
                    </div>

                    {/* HP表示 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span>HP: <span style={{ color: '#dc3545' }}>{member.hp}</span></span>
                      <div>
                        <button className="brass-button" onClick={(e) => { e.stopPropagation(); adjustStat(index, 'hp', 1); }} style={{ padding: '3px 8px', fontSize: '0.8rem', marginRight: '5px' }}>+</button>
                        <button className="brass-button" onClick={(e) => { e.stopPropagation(); adjustStat(index, 'hp', -1); }} style={{ padding: '3px 8px', fontSize: '0.8rem' }}>-</button>
                      </div>
                    </div>
                    <div style={{ width: '100%', height: '12px', background: '#3d2b1f', marginBottom: '20px', border: '1px solid #000' }}>
                      <div style={{ 
                          width: `${(member.hp / (member.maxHp || 15)) * 100}%`, 
                          height: '100%', 
                          background: '#8b0000' 
                        }} />
                    </div>
                  </div>
                )}



                {/* シリンダー本体 */}
                <div style={{ 
                    position: 'relative', width: '130px', height: '130px', margin: '25px auto 15px auto', 
                    background: '#3d2b1f', borderRadius: '50%', border: '5px double #b8860b', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 15px rgba(0,0,0,0.5)'
                  }} className={member.isSpinning ? (member.isReloading ? "reloading" : "spinning") : ""}>

                  {/* ★追加：セットされている弾丸の巨大表示テキスト */}
                      <div style={{
                        position: 'absolute',
                        top: '-35px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        whiteSpace: 'nowrap',
                        fontSize: '1.4rem',
                        fontWeight: 'bold',
                        color: '#ffd700',
                        textShadow: '2px 2px 4px #000, 0 0 10px #8b0000',
                        pointerEvents: 'none',
                        zIndex: 10
                      }}>
                        {member.hasSetChamber && member.bullets[member.activeChamber] 
                          ? `▼ ${member.bullets[member.activeChamber].name} ▼` 
                          : ""}
                      </div>

                    {member.bullets.map((b, i) => (
                        <div 
                          key={i} 
                          onClick={(e) => e.stopPropagation()}
                          style={{ 
                            position: 'absolute', width: '32px', height: '32px', 
                            backgroundColor: b.name === "空" ? '#1a120b' : '#cd7f32', 
                            borderRadius: '50%', border: '2px solid #000', left: '50%', top: '50%', 
                            margin: '-16px 0 0 -16px', transform: `rotate(${i * 60}deg) translateY(-48px)`, 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            color: '#fff', fontSize: '14px', fontWeight: 'bold',
                            cursor: 'default'
                          }}
                        >
                          {i + 1}
                        </div>
                      ))}
                  <div style={{ color: '#b8860b', fontSize: '50px' }}>⚙</div>
                </div>

                {/* 最新ログ（カード内表示） */}
                <div style={{ 
                  background: 'rgba(0,0,0,0.8)', 
                  color: '#cd7f32', 
                  fontSize: '0.85rem', 
                  padding: '8px', 
                  margin: '10px 0', 
                  minHeight: '2.5rem', 
                  borderLeft: '3px solid #8b0000', 
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  whiteSpace: 'pre-wrap'
                }}>
                  {log.find(entry => entry.includes(member.name)) || "READY"}
                </div>

                {/* 操作ボタン */}
                {(isMyCharacter || isGM) && (
                  <>
                    <button className="brass-button" onClick={(e) => { e.stopPropagation(); spinCylinder(index); }} disabled={battleMembers.some(m => m.isSpinning) || member.hasSetChamber} style={{ width: '100%', padding: '12px', marginBottom: '8px' }}>SPIN CYLINDER</button>
                    <button className="brass-button" onClick={(e) => { e.stopPropagation(); pullTrigger(index); }} disabled={!member.hasSetChamber || battleMembers.some(m => m.isSpinning)} style={{ width: '100%', padding: '12px', marginBottom: '8px', background: '#8b0000' }}> TRIGGER</button>
                    <button className="brass-button" onClick={(e) => { e.stopPropagation(); reloadChar(index); }} disabled={battleMembers.some(m => m.isSpinning) || member.hasSetChamber} style={{ width: '100%', padding: '12px' }}>RELOAD</button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ★キャラクターリアルタイム編集モーダル */}
        {editingMemberIndex !== null && editMemberData && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.7)', zIndex: 10000, display: 'flex',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="parchment-card" style={{ width: '500px', maxHeight: '90vh', overflowY: 'auto', background: '#e4d5b7', color: '#3d2b1f', padding: '25px', textAlign: 'left' }}>
              <h3 style={{ margin: '0 0 15px 0', borderBottom: '2px solid #3d2b1f', textAlign: 'center' }}>
                EDIT CHARACTER: {editMemberData.name}
              </h3>

              {/* 名前 */}
              <label style={{ fontWeight: 'bold' }}>NAME:</label>
              <input 
                value={editMemberData.name} 
                onChange={(e) => setEditMemberData({ ...editMemberData, name: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '15px', background: 'rgba(255,255,255,0.5)', border: '1px solid #3d2b1f' }}
              />

              {/* ステータス設定 */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                <div>
                  <label style={{ fontWeight: 'bold' }}>MAX HP:</label>
                  <input 
                    type="number" value={editMemberData.hp} 
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditMemberData({ ...editMemberData, hp: val, maxHp: Math.max(val, editMemberData.maxHp || val) });
                    }}
                    style={{ width: '100%', padding: '5px' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 'bold' }}>MAX SHIELD:</label>
                  <input 
                    type="number" value={editMemberData.shield} 
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setEditMemberData({ ...editMemberData, shield: val, maxShield: Math.max(val, editMemberData.maxShield || val) });
                    }}
                    style={{ width: '100%', padding: '5px' }}
                  />
                </div>
                <div>
                  <label style={{ fontWeight: 'bold' }}>DEFENSE:</label>
                  <input 
                    type="number" value={editMemberData.defense || 0} 
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value));
                      setEditMemberData({ ...editMemberData, defense: val });
                    }}
                    style={{ width: '100%', padding: '5px' }}
                  />
                </div>
              </div>

              <h4 style={{ margin: '15px 0 10px 0', borderTop: '1px solid #3d2b1f', paddingTop: '10px' }}>SKILLS (技能ボーナス)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                {Object.keys(INITIAL_SKILLS).map(sName => (
                  <div key={sName} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{sName}:</label>
                    <input 
                      type="number" 
                      min="0"
                      value={editMemberData.skills?.[sName] ?? 0}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        setEditMemberData({
                          ...editMemberData,
                          skills: { ...editMemberData.skills, [sName]: val }
                        });
                      }}
                      style={{ width: '60px', padding: '5px' }}
                    />
                  </div>
                ))}
              </div>

              {/* シリンダー弾丸一括編集 */}
              <h4 style={{ margin: '15px 0 10px 0', borderTop: '1px solid #3d2b1f', paddingTop: '10px' }}>BULLET SETTINGS</h4>
              {editMemberData.bullets.map((b, bIdx) => (
                <div key={bIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>SLOT {bIdx + 1}:</span>
                  <select 
                    value={b.name} 
                    onChange={(e) => {
                      const newType = e.target.value;
                      const newBullets = [...editMemberData.bullets];
                      newBullets[bIdx] = { name: newType, ...BULLET_TYPES[newType] };
                      setEditMemberData({ ...editMemberData, bullets: newBullets });
                    }}
                    style={{ padding: '5px', width: '70%' }}
                  >
                    {Object.keys(BULLET_TYPES).map(typeName => {
                      // スロット1以外のとき、専用弾薬の選択肢を除外
                      if (bIdx !== 0 && SLOT1_ONLY_BULLETS.includes(typeName)) {
                        return null;
                      }
                      return <option key={typeName} value={typeName}>{typeName}</option>;
                    })}
                  </select>
                </div>
              ))}

              {/* 必殺技編集 */}
             <h4 style={{ margin: '15px 0 10px 0', borderTop: '1px solid #3d2b1f', paddingTop: '10px' }}>SPECIAL MOVE (必殺技)</h4>
              <select 
                value={editMemberData.specialMove || ""} 
                onChange={(e) => setEditMemberData({ ...editMemberData, specialMove: e.target.value })}
                style={{ width: '100%', padding: '8px', marginBottom: '15px' }}
              >
                <option value="" disabled>必殺技を選択してください</option>
                {Object.keys(SPECIAL_MOVES).map(moveName => (
                  <option key={moveName} value={moveName}>{moveName}</option>
                ))}
              </select>
              {editMemberData.specialMove && SPECIAL_MOVES[editMemberData.specialMove] && (
                <div style={{ 
                  fontSize: '0.85rem', 
                  padding: '8px', 
                  background: 'rgba(0,0,0,0.1)', 
                  borderLeft: '3px solid #3d2b1f', 
                  marginBottom: '15px' 
                }}>
                  {SPECIAL_MOVES[editMemberData.specialMove]}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                <button 
                    type="button"
                    className="brass-button" 
                    onClick={() => copyToSessionTool(editMemberData)} 
                    style={{ width: '100%', padding: '10px', marginBottom: '10px', background: '#5d4037' }}
                  >
                    セッションツール用データをコピー
                </button>
                <button className="brass-button" onClick={saveEditedMember} style={{ flex: 1, padding: '10px', background: '#8b0000' }}>SAVE CHANGES</button>
                <button className="brass-button" onClick={() => { setEditingMemberIndex(null); setEditMemberData(null); }} style={{ flex: 1, padding: '10px', background: '#444' }}>CANCEL</button>
              </div>
            </div>
          </div>
        )}

        {(() => {
          const myMemberIndex = battleMembers.findIndex(m => m.instanceId === myCharId);
          const myMember = myMemberIndex !== -1 ? battleMembers[myMemberIndex] : null;
          const hasSpecialMove = myMember && myMember.specialMove;

          return (
            <div style={{ maxWidth: '900px', margin: '40px auto -30px auto' }}>
              <button
                className="brass-button"
                disabled={!hasSpecialMove}
                onClick={() => triggerSpecialMove(myMemberIndex)}
                style={{
                  width: '100%',
                  padding: '20px',
                  fontSize: '1.8rem',
                  fontWeight: 'bold',
                  background: hasSpecialMove 
                    ? 'linear-gradient(to bottom, #b8860b, #8b0000)' 
                    : '#444',
                  border: '4px double #ffd700',
                  boxShadow: hasSpecialMove ? '0 0 15px #ffd700' : 'none',
                  cursor: hasSpecialMove ? 'pointer' : 'not-allowed',
                  opacity: hasSpecialMove ? 1 : 0.6
                }}
              >
                必殺技
                {hasSpecialMove && <span style={{ fontSize: '1.2rem', display: 'block', marginTop: '5px' }}></span>}
              </button>
            </div>
          );
        })()}

        {/* ログエリア：鉄板風デザイン */}
        <div className="iron-log-panel" style={{ marginTop: '50px', maxWidth: '900px', margin: '50px auto 20px auto', border: '6px ridge #5d4037' }}>
          <div style={{ color: '#cd7f32', fontSize: '1.8rem', marginBottom: '15px', borderBottom: '2px ridge #5d4037', paddingBottom: '10px', textShadow: '1px 1px #000' }}>
             {log.length > 0 ? log[0] : "THE GAUNTLET AWAITS..."}
          </div>
          <div style={{ height: '180px', overflowY: 'scroll', background: 'rgba(0,0,0,0.6)', padding: '15px', maxWidth: '850px', margin: '0 auto', textAlign: 'left', border: '1px solid #3d2b1f', color: '#ddd', fontSize: '1rem' }}>
            {log.map((entry, i) => <p key={i} style={{ margin: '7px 0', fontSize: '0.9rem', color: i === 0 ? '#fff' : '#aaa', borderBottom: '1px dashed rgba(255,255,255,0.1)',whiteSpace: 'pre-wrap' }}>{`>> ${entry}`}</p>)}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
          {/* ★追加：緊急ロック解除ボタン */}
          <button 
            className="brass-button" 
            onClick={resetLocks}
            style={{ padding: '15px 30px', fontSize: '1rem', background: '#d9534f' }}
          >
           操作を受け付けなくなった際に押してください
          </button>
          </div>

          <button 
            className="brass-button" 
            onClick={() => setMenuMode('load')} 
            style={{ padding: '15px 30px', fontSize: '1rem', background: '#5d4037' }}
          >
            PREPARATION SCREEN (準備画面に戻る)
          </button>

        {isGM && (
          <button 
            className="brass-button" 
            onClick={async () => {
              if (!window.confirm("本当に終了しますか？")) return;
              
              const battleRef = doc(db, "battles", currentRoomId);
              await updateDoc(battleRef, { isBattleActive: false, members: [], log: ["バトル終了"] });
              setMenuMode('load');
              setIsBattleActive(false);
            }} 
            style={{ padding: '15px 40px', marginTop: '20px', fontSize: '1.2rem', background: 'linear-gradient(to bottom, #444, #111)', border: '3px double #888' }}
          >
            BATTLE END
          </button>
        )}

      </div>
    );
  }

  // メインメニューの描画
  return (
    <div style={{ 
      padding: '30px', 
      textAlign: 'center', 
      minHeight: '100vh', 
      backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png"), linear-gradient(to bottom right, #5d4037, #2d1b0f)', 
      backgroundAttachment: 'fixed',
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      position: 'relative'
    }}>

      {/* 1. メインメニュー（これだけを羊皮紙に乗せる） */}
      {menuMode === 'menu' && (
        <div className="parchment-card" style={{
          margin: '0 auto',
          padding: '40px 60px',
          background: '#e4d5b7',
          backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")',
          boxShadow: '0 0 40px rgba(0,0,0,0.6), inset 0 0 100px rgba(139, 69, 19, 0.2)',
          borderRadius: '5px',
          border: '1px solid #d2b48c',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: 'rotate(-0.5deg)',
          color: '#3d2b1f',
          minWidth: '600px'
        }}>
          <h1 style={{ 
            color: '#8b4513', 
            textShadow: '1px 1px 0px rgba(255,255,255,0.5)', 
            fontSize: '4.5rem', 
            letterSpacing: '12px', 
            margin: '0 0 30px 0',
            fontFamily: 'Metal Mania, cursive',
            borderBottom: '4px double #8b4513',
            display: 'inline-block',
            paddingBottom: '10px'
          }}>
            ROULETTE REVOLVER
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '40px' }}>
            <button 
              className="brass-button" 
              onClick={createRoom} 
              style={{ width: '420px', height: '160px', fontSize: '2.2rem' }}
            >
              CREATE ROOM<br/>
              <span style={{ fontSize: '1rem' }}>(部屋を立ててURL生成)</span>
            </button>

            <div style={{ width: '550px', display: 'flex', justifyContent: 'space-between', gap: '20px', borderTop: '2px solid rgba(61, 43, 31, 0.3)', paddingTop: '30px' }}>
              <button 
                className="brass-button" 
                onClick={() => setMenuMode('load')} 
                style={{ flex: 1, padding: '18px', fontSize: '1.2rem' }}
              >
                RETURN ROOM
              </button>
              <button 
                className="brass-button" 
                onClick={() => setMenuMode('credits')} 
                style={{ flex: 1, padding: '18px', fontSize: '1.2rem', background: '#5d4037' }}
              >
                CREDITS
              </button>
             
            </div>
          </div>
        </div>
      )}


      {/* 2. クレジット画面 */}
      {menuMode === 'credits' && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="parchment-card" style={{
            width: '600px',
            color: '#3d2b1f',
            background: '#e4d5b7',
            backgroundImage: 'url("https://www.transparenttextures.com/patterns/paper-fibers.png")',
            padding: '40px',
            textAlign: 'center',
            boxShadow: '0 0 40px rgba(0,0,0,0.6), inset 0 0 100px rgba(139, 69, 19, 0.2)',
            borderRadius: '5px',
            border: '1px solid #d2b48c'
          }}>
            <h2 style={{ 
              color: '#8b4513', 
              fontSize: '2.5rem', 
              borderBottom: '2px dashed #3d2b1f', 
              paddingBottom: '10px',
              margin: '0 0 20px 0',
              fontFamily: 'Metal Mania, cursive'
            }}>
              CREDITS
            </h2>

            <div style={{ textAlign: 'left', lineHeight: '1.8', fontSize: '1rem', margin: '20px 0', maxHeight: '300px', overflowY: 'auto' }}>
              <div style={{ marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#8b0000', borderBottom: '1px solid #3d2b1f' }}>GAME DESIGN & SYSTEM</h4>
                <p style={{ margin: 0, fontWeight: 'bold' }}>創作巣窟総力サークル</p>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#8b0000', borderBottom: '1px solid #3d2b1f' }}>SPECIAL THANKS</h4>
                
                <p style={{ margin: 0 }}>きつねさま</p>
                <p style={{ margin: 0 }}>ばにしんぐ</p>
                <p style={{ margin: 0 }}>アリトトマ</p>
                <p style={{ margin: 0 }}>ZAKU</p>
                <p style={{ margin: 0 }}>& All Players & Testers</p>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#8b0000', borderBottom: '1px solid #3d2b1f' }}>LIBRARIES & SERVICES</h4>
                <p style={{ margin: 0 }}>React - Copyright (c) Meta Platforms, Inc. and affiliates. (MIT License)</p>
                <p style={{ margin: 0 }}>Firebase - Copyright (c) Google LLC (Apache License 2.0)</p>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#8b0000', borderBottom: '1px solid #3d2b1f' }}>ASSETS & FONTS</h4>
                <p style={{ margin: 0 }}>Font: Metal Mania - Copyright (c) Open Font License</p>
                <p style={{ margin: 0 }}>Textures: Transparent Textures</p>
              </div>

              

              <div style={{ marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 5px 0', color: '#8b0000', borderBottom: '1px solid #3d2b1f' }}>VERSION</h4>
                <p style={{ margin: 0 }}>v1.0.0</p>
              </div>

              <div style={{ marginTop: '20px', textAlign: 'center', borderTop: '1px solid #3d2b1f', paddingTop: '10px' }}>
                <p style={{ margin: 0 }}>© 創作巣窟総力サークル All Rights Reserved.</p>
              </div>
            </div>

            <button 
              className="brass-button" 
              onClick={() => setMenuMode('menu')} 
              style={{ width: '100%', padding: '12px', marginTop: '20px', background: '#444' }}
            >
              BACK TO MENU
            </button>
          </div>
        </div>
      )}


      {/* 3. バトル準備画面 */}
      {menuMode === 'load' && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="parchment-card" style={{ width: '600px', color: '#3d2b1f', background: '#e4d5b7', padding: '30px' }}>
              <h3 style={{ borderBottom: '2px solid #3d2b1f' }}>SELECT COMBATANTS</h3>

              {/* ★招待URL表示エリア */}
              {shareUrl && (
                <div style={{ background: 'rgba(0,0,0,0.1)', padding: '10px', marginBottom: '15px', borderRadius: '5px' }}>
                  <p style={{ margin: '0 0 5px 0', fontSize: '0.8rem', fontWeight: 'bold' }}>招待URL:</p>
                  <input value={shareUrl} readOnly style={{ width: '75%', padding: '5px', fontSize: '0.8rem' }} />
                  <button className="brass-button" onClick={() => { navigator.clipboard.writeText(shareUrl); alert("コピーしました！"); }} style={{ marginLeft: '5px', padding: '5px 10px', fontSize: '0.8rem' }}>
                    コピー
                  </button>
                </div>
              )}

              {/* 現在参戦中のメンバー一覧 */}
              <p style={{ fontSize: '1rem', color: '#5d4037', fontWeight: 'bold' }}>
                CURRENT COMBATANTS: {battleMembers.map(m => m.name).join(' VS ') || "AWAITING..."}
              </p>

              <button 
                className="brass-button" 
                onClick={async () => {
                  if (!currentRoomId) return;
                  const battleRef = doc(db, "battles", currentRoomId);
                  await updateDoc(battleRef, { members: [] });
                }} 
                disabled={battleMembers.length === 0}
                style={{ width: '100%', padding: '8px', marginBottom: '15px', background: '#8b0000', fontSize: '0.9rem' }}
              >
                CLEAR ALL ENTRY (全参戦解除)
              </button>

              <div style={{ maxHeight: '200px', overflowY: 'auto', margin: '15px 0', padding: '10px', background: 'rgba(0,0,0,0.1)' }}>
                {characters.map(char => (
                  <button 
                      key={char.id} 
                      className="brass-button" 
                      onClick={async () => {
                        if (!currentRoomId) return;
                        const battleRef = doc(db, "battles", currentRoomId);
                        // 端末ごとに一意のIDを付与して自分のキャラを識別
                        const myEntry = { ...char, instanceId: `${char.id}_${Date.now()}` };
                        const newMembers = [...battleMembers, myEntry];
    
                        await updateDoc(battleRef, { 
                          members: newMembers,
                          log: [`${char.name} が参戦した！`, ...log]
                        });
    
                        setMyCharId(myEntry.instanceId); // 自分の操作キャラを保持
                        setMenuMode('battle');
                      }} 
                      style={{ width: '95%', padding: '12px', margin: '8px auto', display: 'block' }}
                    >
                      {char.name} で参戦する
                    </button>
                ))}
              </div>

              {/* ★新規作成への誘導ボタン */}
              <button className="brass-button" onClick={() => setMenuMode('create')} style={{ width: '100%', padding: '10px', marginBottom: '15px', background: '#5d4037' }}>
                ＋ 新しいキャラを作成する
              </button>

              {/* 参戦せずに直接観戦・バトル画面に入るボタン */}
              <button 
                className="brass-button" 
                onClick={() => setMenuMode('battle')} 
                style={{ width: '100%', padding: '15px', background: 'linear-gradient(to bottom, #8b0000, #4a0000)', fontSize: '1.2rem', marginBottom: '10px' }}
              >
                JOIN BATTLE SCREEN (バトル画面へ入る)
              </button>

              {!isGuest && (
                <button 
                  className="brass-button" 
                  onClick={() => setMenuMode('menu')} 
                  style={{ width: '100%', padding: '10px', marginTop: '10px', background: '#444' }}
                >
                  BACK TO MENU
                </button>
              )}
            </div>
          </div>
        )}

      
      {/* 4. キャラ作成画面 */}
      {menuMode === 'create' && (
          <div className="parchment-card" style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'left' }}>
            <h3 style={{ textAlign: 'center', borderBottom: '2px solid #3d2b1f', fontSize: '2rem' }}>NEW UNIT BLUEPRINT</h3>
    
            <label style={{ fontWeight: 'bold', color: '#5d4037' }}>UNIT NAME</label>
                <input 
                  value={newCharName} 
                  onChange={(e) => setNewCharName(e.target.value)} 
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px', marginBottom: '25px', background: 'rgba(255,255,255,0.4)', border: '2px solid #3d2b1f', fontFamily: 'serif', fontSize: '1.2rem' }} 
                  placeholder="ENTER UNIT NAME..." 
                />

            <div style={{ 
              display: 'flex', 
              justify: 'center', 
              gap: '20px', 
              margin: '10px 0 30px 0' 
            }}>
              {/* 戦闘用ポイント */}
              <div style={{ flex: 1, paddingTop: '15px', background: 'rgba(0,0,0,0.2)', border: '4px double #8b0000', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ color: '#5d4037', fontSize: '0.9rem', fontWeight: 'bold' }}>COMBAT POINTS (耐久・弾薬)</div>
                <div style={{ color: combatPoints < 0 ? '#ff0000' : '#8b0000', fontSize: '3.5rem', fontWeight: 'bold' }}>
                  {combatPoints}
                </div>
              </div>

              {/* 探索用ポイント */}
              <div style={{ flex: 1, padding: '15px', background: 'rgba(0,0,0,0.2)', border: '4px double #3b5998', borderRadius: '10px', textAlign: 'center' }}>
                <div style={{ color: '#5d4037', fontSize: '0.9rem', fontWeight: 'bold' }}>EXPLORE POINTS (技能)</div>
                <div style={{ color: explorePoints < 0 ? '#ff0000' : '#3b5998', fontSize: '3.5rem', fontWeight: 'bold' }}>
                  {explorePoints}
                </div>
              </div>
            </div>



            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>

              {/* 左側：基本情報とステータス */}
              <div style={{ flex: '1', minWidth: '300px' }}>
                

                <div style={{ 
                    flex: 1, 
                    minWidth: '280px',
                    boxSizing: 'border-box', 
                    padding: '15px', 
                    border: '3px double #3d2b1f', 
                    background: 'rgba(0,0,0,0.05)', 
                    borderRadius: '5px' 
                  }}>

                  <div style={{ color: '#8b0000', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '10px', textAlign: 'center', borderBottom: '1px solid #3d2b1f' }}>
                      TOUGHNESS
                    </div>
          
                  {[
                    { label: 'HP(1pt)', key: 'hp', cost: 1 },
                    { label: 'SHIELD(2pt)', key: 'shield', cost: 2 },
                    { label: 'DEFENSE(5pt)', key: 'defense', cost: 5 }
                  ].map(stat => (
                    <div key={stat.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '15px 0' }}>
                      <span style={{ fontWeight: 'bold' }}>{stat.label}: <span style={{ fontSize: '1.4rem' }}>{stats[stat.key]}</span></span>
                      <div>
                        <button className="brass-button" onClick={() => updateStat(stat.key, 1)} style={{ width: '40px', height: '40px', marginRight: '5px' }}>+</button>
                        <button className="brass-button" onClick={() => updateStat(stat.key, -1)} style={{ width: '40px', height: '40px' }}>-</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ 
                flex: 1, 
                minWidth: '280px',
                boxSizing: 'border-box', 
                padding: '15px', 
                border: '3px double #3d2b1f', 
                background: 'rgba(0,0,0,0.05)', 
                borderRadius: '5px' 
              }}>

                <div style={{ color: '#8b0000', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '10px', textAlign: 'center', borderBottom: '1px solid #3d2b1f' }}>
                  SKILLS (1pt)
                </div>

                {Object.keys(INITIAL_SKILLS).map((sName) => {
                  const isSkillMax = skills[sName] >= 6;

                  return (
                    <div key={sName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '8px 0' }}>
                      <span style={{ fontWeight: 'bold', color: '#3d2b1f' }}>
                        {sName}: <span style={{ fontSize: '1.2rem', color: '#8b0000' }}>+{skills[sName]}</span>
                      </span>
                      <div>
                        <button 
                          type="button" 
                          className="brass-button" 
                          disabled={isSkillMax || explorePoints < 1}
                          onClick={() => updateSkill(sName, 1)} 
                          style={{ 
                            width: '35px', 
                            height: '35px', 
                            marginRight: '5px',
                            opacity: (isSkillMax || explorePoints < 1) ? 0.4 : 1,
                            cursor: (isSkillMax || explorePoints < 1) ? 'not-allowed' : 'pointer'
                          }}
                        >
                          +
                        </button>
                        <button 
                          type="button" 
                          className="brass-button" 
                          disabled={skills[sName] <= 0}
                          onClick={() => updateSkill(sName, -1)} 
                          style={{ width: '35px', height: '35px' }}
                        >
                          -
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
                

              {/* 右側：弾薬スロットと選択ボタン、そして作成ボタン */}
              <div style={{ flex: '1.5', minWidth: '400px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#5d4037' }}>CYLINDER SLOTS (Select a slot to edit)</h4>
        
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
                    {newBullets.map((b, i) => (
                      <div 
                        key={i} 
                        onClick={() => setSelectedSlot(i)}
                        style={{ 
                          padding: '10px', 
                          background: selectedSlot === i ? '#8b0000' : '#1a120b', 
                          color: selectedSlot === i ? '#fff' : '#cd7f32', 
                          border: selectedSlot === i ? '2px solid #ffd700' : '1px solid #b8860b', 
                          borderRadius: '3px', textAlign: 'center', fontSize: '0.8rem', cursor: 'pointer',
                          boxShadow: selectedSlot === i ? '0 0 10px #ffd700' : 'none',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div style={{ opacity: 0.7, marginBottom: '3px' }}>SLOT {i + 1}</div>
                        <div style={{ fontWeight: 'bold' }}>{b?.name || "空"}</div>
                      </div>
                    ))}
                  </div>

                  <h4 style={{ margin: '20px 0 10px 0', color: '#5d4037', borderTop: '1px solid #3d2b1f', paddingTop: '10px' }}>
                    AMMO FOR SLOT {selectedSlot + 1}
                  </h4>

                  {/* 弾薬選択ボタン */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {Object.entries(BULLET_TYPES).map(([typeName, typeData]) => {
                      const currentAmmoCost = BULLET_TYPES[newBullets[selectedSlot]?.name]?.cost || 0;
                      const isAffordable = combatPoints + currentAmmoCost - typeData.cost >= 0; 

                      const isSlotValid = selectedSlot === 0 || !SLOT1_ONLY_BULLETS.includes(typeName);
                      const isDisabled = !isAffordable || !isSlotValid;

                      return (
                        <button 
                          key={typeName} 
                          className="brass-button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (isDisabled) return;
                            const nb = [...newBullets];
                            nb[selectedSlot] = { name: typeName, ...typeData };
                            setNewBullets(nb);
                            setCombatPoints(combatPoints + currentAmmoCost - typeData.cost);
                            if(selectedSlot < 5) setSelectedSlot(selectedSlot + 1);
                          }}
                            style={{ 
                              textAlign: 'left', padding: '10px 15px', textTransform: 'none', 
                              height: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              opacity: isDisabled ? 0.4 : 1,
                              cursor: isDisabled ? 'not-allowed' : 'pointer'
                            }}
                          >
                            <div style={{ maxWidth: '85%' }}>
                              <div style={{ fontSize: '1.1rem', color: isDisabled ? '#888' : '#ffd700' }}>
                                {typeName} (COST: {typeData.cost}) {!isSlotValid && "※スロット1専用"}
                              </div>
                              <div style={{ fontSize: '0.75rem', opacity: 0.9 , }}>{typeData.effect}</div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '0.8rem', borderLeft: '1px solid rgba(255,255,255,0.2)', width: '80px', paddingLeft: '10px' }}>
                              HIT: {typeData.hit_rate}%<br />PWR: {typeData.power}
                            </div>
                          </button>
                        );
                    })}
                </div>

              

                {/* 必殺技選択UI */}
                <h4 style={{ margin: '20px 0 10px 0', color: '#5d4037', borderTop: '1px solid #3d2b1f', paddingTop: '10px' }}>
                  SPECIAL MOVE (必殺技を1つ選択)
                </h4>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(SPECIAL_MOVES).map(([moveName, moveEffect]) => {
                    const isSelected = selectedSpecialMove === moveName;
                    return (
                      <button 
                        key={moveName} 
                        className="brass-button"
                        onClick={() => setSelectedSpecialMove(moveName)}
                        style={{ 
                          textAlign: 'left', padding: '10px 15px', textTransform: 'none', 
                          height: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: isSelected ? '#8b0000' : undefined,
                          border: isSelected ? '2px solid #ffd700' : undefined,
                          boxShadow: isSelected ? '0 0 10px #ffd700' : 'none'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '1.1rem', color: isSelected ? '#fff' : '#ffd700' }}>
                            {moveName} {isSelected && "✓"}
                          </div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>{moveEffect}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                

                {/* 必殺技リストの下にボタンを配置！ */}
                <div style={{ marginTop: '30px', borderTop: '2px solid #3d2b1f', paddingTop: '20px' }}>
                    <button 
                    type="button"
                    className="brass-button" 
                    onClick={() => copyToSessionTool({ name: newCharName, hp: stats.hp, shield: stats.shield, defense: stats.defense, skills })} 
                    style={{ width: '100%', padding: '10px', fontSize: '1rem', marginBottom: '10px', background: '#5d4037' }}
                  >
                    セッションツール用データをコピー
                  </button>
                  <button className="brass-button" onClick={saveCharacter} style={{ width: '100%', padding: '20px', fontSize: '1.5rem', marginBottom: '10px' }}>
                    ARCHIVE DATA
                  </button>
                  <button className="brass-button" onClick={() => setMenuMode('load')} style={{ width: '100%', padding: '10px', background: '#444' }}>
                    CANCEL
                  </button>
                </div>
                
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default App;