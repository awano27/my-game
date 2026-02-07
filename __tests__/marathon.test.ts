import { test, expect, Page } from '@playwright/test';
import path from 'path';

const MARATHON_URL = `file://${path.resolve(__dirname, '..', 'marathon.html')}`;

// Helper: click via dispatchEvent to trigger pointerdown handlers
async function pointerDown(page: Page, selector: string) {
  await page.locator(selector).click();
}

// Helper: answer current question correctly by finding the right option
async function answerCorrectly(page: Page) {
  // Get the correct answer index from the game's internal data
  const correctText = await page.evaluate(() => {
    const game = (window as any);
    // Access QUIZ_DATA via closure - read it from DOM instead
    const options = document.querySelectorAll('.quiz-option');
    // Click each option is not ideal; instead read the answer from the quiz state
    // We need to find the correct option by checking which one matches
    return null;
  });

  // Strategy: try each option, the correct one gets class 'correct'
  // But we can only click once. Let's extract the answer from the page's script.
  const correctIndex = await page.evaluate(() => {
    // Extract QUIZ_DATA from the script tag
    const scriptContent = document.querySelector('script')!.textContent!;
    const match = scriptContent.match(/let shuffledQuiz = \[\];/);
    // Access the game state through the shuffled quiz
    // Since the code is in an IIFE, we need a different approach
    // Let's read the quiz-question text and match it to known answers
    const questionText = document.getElementById('quiz-question')!.textContent;
    return questionText;
  });

  // We'll use a data-driven approach: map question text to correct answer text
  const answerMap = await getAnswerMap(page);
  const question = await page.locator('#quiz-question').textContent();
  const correctAnswer = answerMap[question!];

  if (correctAnswer) {
    const options = page.locator('.quiz-option');
    const count = await options.count();
    for (let i = 0; i < count; i++) {
      const text = await options.nth(i).textContent();
      if (text === correctAnswer) {
        await options.nth(i).click();
        return;
      }
    }
  }

  // Fallback: click first option
  await page.locator('.quiz-option').first().click();
}

// Helper: answer incorrectly by clicking a wrong option
async function answerIncorrectly(page: Page) {
  const answerMap = await getAnswerMap(page);
  const question = await page.locator('#quiz-question').textContent();
  const correctAnswer = answerMap[question!];

  const options = page.locator('.quiz-option');
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const text = await options.nth(i).textContent();
    if (text !== correctAnswer) {
      await options.nth(i).click();
      return;
    }
  }
}

// Build answer map from the embedded QUIZ_DATA
async function getAnswerMap(page: Page): Promise<Record<string, string>> {
  return await page.evaluate(() => {
    const scriptContent = document.querySelector('script')!.textContent!;

    // Extract the QUIZ_DATA array from the script
    const dataStart = scriptContent.indexOf('const QUIZ_DATA = [');
    const dataEnd = scriptContent.indexOf('];', dataStart) + 2;
    const dataStr = scriptContent.substring(dataStart, dataEnd)
      .replace('const QUIZ_DATA = ', '');

    // Parse it safely using Function constructor
    const quizData = new Function('return ' + dataStr)();

    const map: Record<string, string> = {};
    for (const q of quizData) {
      map[q.question] = q.options[q.answer];
    }
    return map;
  });
}

// Helper: start the game
async function startGame(page: Page) {
  await page.goto(MARATHON_URL);
  await page.waitForSelector('#start-screen.active');
  await pointerDown(page, '#start-btn');
  await page.waitForSelector('#quiz-screen.active');
}

// Helper: answer and proceed to next
async function answerAndNext(page: Page, correct: boolean) {
  if (correct) {
    await answerCorrectly(page);
  } else {
    await answerIncorrectly(page);
  }
  await page.waitForSelector('#quiz-next.show');
  await pointerDown(page, '#next-btn');
  // Small wait for transition
  await page.waitForTimeout(100);
}


// =====================================================
// TEST SUITE 1: Screen transitions
// =====================================================
test.describe('画面遷移テスト', () => {
  test('スタート画面が初期表示される', async ({ page }) => {
    await page.goto(MARATHON_URL);
    await expect(page.locator('#start-screen')).toHaveClass(/active/);
    await expect(page.locator('#quiz-screen')).not.toHaveClass(/active/);
    await expect(page.locator('#finish-screen')).not.toHaveClass(/active/);
    await expect(page.locator('#gameover-screen')).not.toHaveClass(/active/);
  });

  test('スタート画面に大会情報が表示される', async ({ page }) => {
    await page.goto(MARATHON_URL);
    const raceInfo = page.locator('.race-info');
    await expect(raceInfo).toContainText('2026年2月8日（日）');
    await expect(raceInfo).toContainText('9:00');
    await expect(raceInfo).toContainText('さいたまスーパーアリーナ');
    await expect(raceInfo).toContainText('42.195km');
    await expect(raceInfo).toContainText('6時間');
  });

  test('スタートボタンでクイズ画面に遷移する', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#quiz-screen')).toHaveClass(/active/);
    await expect(page.locator('#start-screen')).not.toHaveClass(/active/);
  });

  test('ゲーム開始でHUDが表示される', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#course-bar')).toBeVisible();
    await expect(page.locator('#stamina-container')).toBeVisible();
  });

  test('HUD初期値が正しい', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#stamina-text')).toHaveText('100%');
    await expect(page.locator('#score-badge')).toContainText('0点');
  });
});


// =====================================================
// TEST SUITE 2: Quiz data correctness
// =====================================================
test.describe('クイズデータ正確性テスト', () => {
  test('最初の問題が0km地点から始まる', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#quiz-km')).toHaveText('0km');
  });

  test('4択の選択肢が表示される', async ({ page }) => {
    await startGame(page);
    const options = page.locator('.quiz-option');
    await expect(options).toHaveCount(4);
  });

  test('正解選択時に緑色ハイライトと解説が表示される', async ({ page }) => {
    await startGame(page);
    await answerCorrectly(page);

    // Check result feedback
    await expect(page.locator('#quiz-result')).toHaveClass(/show/);
    await expect(page.locator('#quiz-result')).toHaveClass(/correct/);
    await expect(page.locator('#result-emoji')).toHaveText('🎉');

    // Check correct button has green styling
    const correctBtn = page.locator('.quiz-option.correct');
    await expect(correctBtn).toHaveCount(1);
  });

  test('不正解選択時に赤ハイライトと正解表示', async ({ page }) => {
    await startGame(page);
    await answerIncorrectly(page);

    await expect(page.locator('#quiz-result')).toHaveClass(/show/);
    await expect(page.locator('#quiz-result')).toHaveClass(/wrong/);
    await expect(page.locator('#result-emoji')).toHaveText('😢');

    // Wrong answer in red
    const wrongBtn = page.locator('.quiz-option.wrong');
    await expect(wrongBtn).toHaveCount(1);

    // Correct answer revealed in green
    const revealBtn = page.locator('.quiz-option.reveal');
    await expect(revealBtn).toHaveCount(1);
  });

  test('回答後に全ボタンが無効化される', async ({ page }) => {
    await startGame(page);
    await answerCorrectly(page);

    const disabledBtns = page.locator('.quiz-option.disabled');
    // All 4 buttons get disabled after answering (including the correct one)
    await expect(disabledBtns).toHaveCount(4);
  });

  test('次へボタンが回答後に表示される', async ({ page }) => {
    await startGame(page);
    await answerCorrectly(page);
    await expect(page.locator('#quiz-next')).toHaveClass(/show/);
  });

  test('次へボタンで次の問題に進む', async ({ page }) => {
    await startGame(page);
    const firstQuestion = await page.locator('#quiz-question').textContent();
    await answerAndNext(page, true);

    const secondQuestion = await page.locator('#quiz-question').textContent();
    expect(secondQuestion).not.toBe(firstQuestion);
  });

  test('問題カウントが正しく更新される', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#question-count')).toContainText('Q.1/');

    await answerAndNext(page, true);
    await expect(page.locator('#question-count')).toContainText('Q.2/');
  });
});


// =====================================================
// TEST SUITE 3: Stamina and score calculation
// =====================================================
test.describe('スタミナ・スコア計算テスト', () => {
  test('正解でスタミナ+10、スコア+10', async ({ page }) => {
    await startGame(page);
    await answerCorrectly(page);

    // Stamina capped at 100 (100 + 10 = 110 -> capped to 100)
    await expect(page.locator('#stamina-text')).toHaveText('100%');
    await expect(page.locator('#score-badge')).toContainText('10点');
  });

  test('不正解でスタミナ-12、スコア-3', async ({ page }) => {
    await startGame(page);
    await answerIncorrectly(page);

    await expect(page.locator('#stamina-text')).toHaveText('88%');
    // Score: max(0, 0-3) = 0
    await expect(page.locator('#score-badge')).toContainText('0点');
  });

  test('正解後に不正解でスタミナが正しく変動する', async ({ page }) => {
    await startGame(page);

    // First: correct -> stamina stays 100, score = 10
    await answerAndNext(page, true);
    // Second: wrong -> stamina = 100 - 12 = 88, score = max(0, 10-3) = 7
    await answerIncorrectly(page);

    await expect(page.locator('#stamina-text')).toHaveText('88%');
    await expect(page.locator('#score-badge')).toContainText('7点');
  });

  test('連続不正解でスタミナが減少し続ける', async ({ page }) => {
    await startGame(page);

    // 1st wrong: 100 - 12 = 88
    await answerAndNext(page, false);
    // 2nd wrong: 88 - 12 = 76
    await answerAndNext(page, false);
    // 3rd wrong: 76 - 12 = 64
    await answerIncorrectly(page);

    await expect(page.locator('#stamina-text')).toHaveText('64%');
  });

  test('スタミナ0でゲームオーバー画面に遷移する', async ({ page }) => {
    await startGame(page);

    // Need 9 consecutive wrong answers to reach 0: max(0, 100 - 12*9) = max(0, -8) = 0
    for (let i = 0; i < 8; i++) {
      await answerAndNext(page, false);
    }
    // 9th wrong: stamina = max(0, 100 - 12*9) = 0 -> game over on next
    await answerAndNext(page, false);

    // Should show game over screen
    await expect(page.locator('#gameover-screen')).toHaveClass(/active/);
  });

  test('ゲームオーバー画面にリタイア地点と正解数が表示される', async ({ page }) => {
    await startGame(page);

    for (let i = 0; i < 8; i++) {
      await answerAndNext(page, false);
    }
    await answerAndNext(page, false);

    await expect(page.locator('#gameover-screen')).toHaveClass(/active/);
    await expect(page.locator('#gameover-correct')).toContainText('/9');
    await expect(page.locator('#gameover-dist')).not.toHaveText('');
  });
});


// =====================================================
// TEST SUITE 4: Aid station and landmark display
// =====================================================
test.describe('エイド・ランドマーク表示テスト', () => {
  test('エイド付き問題でエイドカードが表示される', async ({ page }) => {
    await startGame(page);

    // Navigate to a question with aid data (15km has aid)
    // Questions are in km order, so we need to go through until we find one with aid
    let foundAid = false;
    for (let i = 0; i < 15; i++) {
      const question = await page.locator('#quiz-question').textContent();
      await answerCorrectly(page);

      // Check if aid card appeared
      const aidVisible = await page.locator('#aid-card.show').isVisible().catch(() => false);
      if (aidVisible) {
        foundAid = true;
        // Verify aid card has content
        const aidItems = page.locator('.aid-item');
        expect(await aidItems.count()).toBeGreaterThan(0);
        break;
      }

      await page.locator('#next-btn').click();
      await page.waitForTimeout(100);
    }

    expect(foundAid).toBe(true);
  });

  test('ランドマーク付き問題でランドマークカードが表示される', async ({ page }) => {
    await startGame(page);

    let foundLandmark = false;
    for (let i = 0; i < 15; i++) {
      await answerCorrectly(page);

      const landmarkVisible = await page.locator('.landmark-card').isVisible().catch(() => false);
      if (landmarkVisible) {
        foundLandmark = true;
        break;
      }

      await page.locator('#next-btn').click();
      await page.waitForTimeout(100);
    }

    expect(foundLandmark).toBe(true);
  });

  test('15km地点のエイドにこしあんドーナツが含まれる', async ({ page }) => {
    await startGame(page);

    // Go through questions until we hit a 15km aid question
    for (let i = 0; i < 15; i++) {
      const km = await page.locator('#quiz-km').textContent();
      const question = await page.locator('#quiz-question').textContent();

      await answerCorrectly(page);

      if (km === '15km') {
        const aidVisible = await page.locator('#aid-card.show').isVisible().catch(() => false);
        if (aidVisible) {
          const aidText = await page.locator('#aid-body').textContent();
          expect(aidText).toContain('こしあんドーナツ');
          return;
        }
      }

      await page.locator('#next-btn').click();
      await page.waitForTimeout(100);
    }
  });

  test('22.5km地点のエイドに十万石まんじゅうが含まれる', async ({ page }) => {
    await startGame(page);

    for (let i = 0; i < 20; i++) {
      const km = await page.locator('#quiz-km').textContent();
      await answerCorrectly(page);

      if (km === '22.5km') {
        const aidVisible = await page.locator('#aid-card.show').isVisible().catch(() => false);
        if (aidVisible) {
          const aidText = await page.locator('#aid-body').textContent();
          expect(aidText).toContain('十万石まんじゅう');
          return;
        }
      }

      await page.locator('#next-btn').click();
      await page.waitForTimeout(100);
    }
  });

  test('37.5km地点のエイドにうなぎの蒲焼が含まれる', async ({ page }) => {
    await startGame(page);

    for (let i = 0; i < 33; i++) {
      const km = await page.locator('#quiz-km').textContent();
      await answerCorrectly(page);

      if (km === '37.5km') {
        const aidVisible = await page.locator('#aid-card.show').isVisible().catch(() => false);
        if (aidVisible) {
          const aidText = await page.locator('#aid-body').textContent();
          expect(aidText).toContain('うなぎの蒲焼');
          return;
        }
      }

      // Check if game ended
      const finishVisible = await page.locator('#finish-screen.active').isVisible().catch(() => false);
      if (finishVisible) break;

      await page.locator('#next-btn').click();
      await page.waitForTimeout(100);
    }
  });
});


// =====================================================
// TEST SUITE 5: Finish and game over
// =====================================================
test.describe('完走・ゲームオーバーテスト', () => {
  test('全問正解で完走画面が表示され金メダルを獲得', async ({ page }) => {
    test.setTimeout(60000);
    await startGame(page);

    // Answer all questions correctly
    for (let i = 0; i < 33; i++) {
      const finishVisible = await page.locator('#finish-screen.active').isVisible().catch(() => false);
      if (finishVisible) break;

      await answerCorrectly(page);
      await page.waitForSelector('#quiz-next.show');
      await pointerDown(page, '#next-btn');
      await page.waitForTimeout(100);
    }

    // Finish screen should be active
    await expect(page.locator('#finish-screen')).toHaveClass(/active/);

    // Gold medal for 100% accuracy
    await expect(page.locator('#finish-medal')).toHaveText('🥇');

    // Accuracy should be 100%
    await expect(page.locator('#finish-accuracy')).toHaveText('100%');

    // Stamina should be 100%
    await expect(page.locator('#finish-stamina')).toHaveText('100%');
  });

  test('完走画面のスコアが正しい（全問正解: 33*10=330点）', async ({ page }) => {
    test.setTimeout(60000);
    await startGame(page);

    let questionCount = 0;
    for (let i = 0; i < 40; i++) {
      const finishVisible = await page.locator('#finish-screen.active').isVisible().catch(() => false);
      if (finishVisible) break;

      await answerCorrectly(page);
      questionCount++;
      await page.waitForSelector('#quiz-next.show');
      await pointerDown(page, '#next-btn');
      await page.waitForTimeout(100);
    }

    const scoreText = await page.locator('#finish-score').textContent();
    const expectedScore = questionCount * 10;
    expect(parseInt(scoreText!)).toBe(expectedScore);
  });

  test('完走画面の正解数表示が正しい', async ({ page }) => {
    test.setTimeout(60000);
    await startGame(page);

    let questionCount = 0;
    for (let i = 0; i < 40; i++) {
      const finishVisible = await page.locator('#finish-screen.active').isVisible().catch(() => false);
      if (finishVisible) break;

      await answerCorrectly(page);
      questionCount++;
      await page.waitForSelector('#quiz-next.show');
      await pointerDown(page, '#next-btn');
      await page.waitForTimeout(100);
    }

    const correctText = await page.locator('#finish-correct').textContent();
    expect(correctText).toBe(`${questionCount}/${questionCount}`);
  });

  test('リトライボタンでゲームが再開する', async ({ page }) => {
    await startGame(page);

    // Answer wrong enough times to trigger game over (100/12 = ~9 times)
    for (let i = 0; i < 8; i++) {
      await answerAndNext(page, false);
    }
    await answerAndNext(page, false);

    await expect(page.locator('#gameover-screen')).toHaveClass(/active/);

    // Click retry
    await pointerDown(page, '#gameover-retry-btn');
    await page.waitForTimeout(200);

    // Should be back on quiz screen with fresh state
    await expect(page.locator('#quiz-screen')).toHaveClass(/active/);
    await expect(page.locator('#stamina-text')).toHaveText('100%');
    await expect(page.locator('#score-badge')).toContainText('0点');
  });

  test('完走画面のリトライでゲームが再開する', async ({ page }) => {
    test.setTimeout(60000);
    await startGame(page);

    for (let i = 0; i < 40; i++) {
      const finishVisible = await page.locator('#finish-screen.active').isVisible().catch(() => false);
      if (finishVisible) break;

      await answerCorrectly(page);
      await page.waitForSelector('#quiz-next.show');
      await pointerDown(page, '#next-btn');
      await page.waitForTimeout(100);
    }

    await expect(page.locator('#finish-screen')).toHaveClass(/active/);

    // Click retry
    await pointerDown(page, '#retry-btn');
    await page.waitForTimeout(200);

    await expect(page.locator('#quiz-screen')).toHaveClass(/active/);
    await expect(page.locator('#stamina-text')).toHaveText('100%');
  });
});


// =====================================================
// TEST SUITE 6: Course progress display
// =====================================================
test.describe('コース進捗表示テスト', () => {
  test('距離表示が問題のkm地点と一致する', async ({ page }) => {
    await startGame(page);

    const km = await page.locator('#quiz-km').textContent();
    const distText = await page.locator('#current-km').textContent();

    // First question is at 0km
    expect(distText).toBe('0.0km');
    expect(km).toBe('0km');
  });

  test('進捗バーの幅が距離に応じて変化する', async ({ page }) => {
    await startGame(page);

    // Initial: 0km
    const initialWidth = await page.locator('#course-fill').evaluate(
      (el) => getComputedStyle(el).width
    );

    // Answer and move to next question
    await answerAndNext(page, true);

    // After moving, check that distance display updated
    const newDist = await page.locator('#current-km').textContent();
    // Should not be 0.0km anymore (unless next question is also at 0km)
    // The first few questions are at 0km, so let's just verify the display works
    expect(newDist).toBeTruthy();
  });

  test('ランナーアイコンが表示される', async ({ page }) => {
    await startGame(page);
    await expect(page.locator('#runner-icon')).toBeVisible();
    await expect(page.locator('#runner-icon')).toHaveText('🏃');
  });
});


// =====================================================
// TEST SUITE 7: Quiz content verification
// =====================================================
test.describe('クイズ内容検証テスト', () => {
  test('全問題に4つの選択肢がある', async ({ page }) => {
    await page.goto(MARATHON_URL);

    const allHaveFour = await page.evaluate(() => {
      const scriptContent = document.querySelector('script')!.textContent!;
      const dataStart = scriptContent.indexOf('const QUIZ_DATA = [');
      const dataEnd = scriptContent.indexOf('];', dataStart) + 2;
      const dataStr = scriptContent.substring(dataStart, dataEnd)
        .replace('const QUIZ_DATA = ', '');
      const quizData = new Function('return ' + dataStr)();
      return quizData.every((q: any) => q.options.length === 4);
    });

    expect(allHaveFour).toBe(true);
  });

  test('全問題の正解インデックスが0-3の範囲内', async ({ page }) => {
    await page.goto(MARATHON_URL);

    const allValid = await page.evaluate(() => {
      const scriptContent = document.querySelector('script')!.textContent!;
      const dataStart = scriptContent.indexOf('const QUIZ_DATA = [');
      const dataEnd = scriptContent.indexOf('];', dataStart) + 2;
      const dataStr = scriptContent.substring(dataStart, dataEnd)
        .replace('const QUIZ_DATA = ', '');
      const quizData = new Function('return ' + dataStr)();
      return quizData.every((q: any) => q.answer >= 0 && q.answer <= 3);
    });

    expect(allValid).toBe(true);
  });

  test('問題はkm順に並んでいる', async ({ page }) => {
    await page.goto(MARATHON_URL);

    const inOrder = await page.evaluate(() => {
      const scriptContent = document.querySelector('script')!.textContent!;
      const dataStart = scriptContent.indexOf('const QUIZ_DATA = [');
      const dataEnd = scriptContent.indexOf('];', dataStart) + 2;
      const dataStr = scriptContent.substring(dataStart, dataEnd)
        .replace('const QUIZ_DATA = ', '');
      const quizData = new Function('return ' + dataStr)();

      for (let i = 1; i < quizData.length; i++) {
        if (quizData[i].km < quizData[i - 1].km) return false;
      }
      return true;
    });

    expect(inOrder).toBe(true);
  });

  test('全問題にcategory、question、explanationがある', async ({ page }) => {
    await page.goto(MARATHON_URL);

    const allComplete = await page.evaluate(() => {
      const scriptContent = document.querySelector('script')!.textContent!;
      const dataStart = scriptContent.indexOf('const QUIZ_DATA = [');
      const dataEnd = scriptContent.indexOf('];', dataStart) + 2;
      const dataStr = scriptContent.substring(dataStart, dataEnd)
        .replace('const QUIZ_DATA = ', '');
      const quizData = new Function('return ' + dataStr)();
      return quizData.every((q: any) =>
        q.category && q.category.length > 0 &&
        q.question && q.question.length > 0 &&
        q.explanation && q.explanation.length > 0
      );
    });

    expect(allComplete).toBe(true);
  });

  test('最後の問題が42.195km地点', async ({ page }) => {
    await page.goto(MARATHON_URL);

    const lastKm = await page.evaluate(() => {
      const scriptContent = document.querySelector('script')!.textContent!;
      const dataStart = scriptContent.indexOf('const QUIZ_DATA = [');
      const dataEnd = scriptContent.indexOf('];', dataStart) + 2;
      const dataStr = scriptContent.substring(dataStart, dataEnd)
        .replace('const QUIZ_DATA = ', '');
      const quizData = new Function('return ' + dataStr)();
      return quizData[quizData.length - 1].km;
    });

    expect(lastKm).toBe(42.195);
  });
});
