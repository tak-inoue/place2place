'use client';

import React, { useState, useEffect, useRef } from 'react';
import styles from './page.module.css';
import ScatterPlot, { PlottedArea } from '@/components/ScatterPlot';
import { getRandomArea, submitResponse, submitColorVote, getColorSummary, PromptArea, ColorSummary } from '@/app/actions';
import { PLACE_COLORS } from '@/lib/colors';

interface VisualizationData {
  summary?: {
    totalResponses: number;
    plottedAreaCount: number;
    unplottedAreaCount: number;
  };
  plotted: PlottedArea[];
  unplotted: Array<{ areaId: number; name: string; responseCount: number }>;
}

export default function Home() {
  // Theme state
  const [theme, setTheme] = useState<'light' | 'night'>('light');
  const [mounted, setMounted] = useState(false);

  // Sync theme with localStorage / system preference on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      const savedTheme = localStorage.getItem('theme') as 'light' | 'night';
      if (savedTheme === 'light' || savedTheme === 'night') {
        setTheme(savedTheme);
      } else {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setTheme(systemPrefersDark ? 'night' : 'light');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Save theme changes to localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('theme', theme);
    }
  }, [theme, mounted]);

  // Input form state
  const [promptArea, setPromptArea] = useState<PromptArea | null>(null);
  const [description, setDescription] = useState('');
  const [loadingArea, setLoadingArea] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Color voting states
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [submittingColor, setSubmittingColor] = useState(false);
  const [colorMessage, setColorMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [colorSummary, setColorSummary] = useState<ColorSummary | null>(null);
  const [loadingColorSummary, setLoadingColorSummary] = useState(false);

  // Switch promptArea based on click or keyboard action
  const handleAreaSelect = (areaId: number) => {
    const foundPlotted = vizData.plotted.find((p) => p.areaId === areaId);
    if (foundPlotted) {
      setPromptArea({ id: foundPlotted.areaId, name: foundPlotted.name });
    } else {
      const foundUnplotted = vizData.unplotted.find((u) => u.areaId === areaId);
      if (foundUnplotted) {
        setPromptArea({ id: foundUnplotted.areaId, name: foundUnplotted.name });
      }
    }
    setMessage(null);
    setColorMessage(null);
    setSelectedColorId(null);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  // Fetch color summary when active Place changes
  useEffect(() => {
    if (!promptArea) {
      const timer = setTimeout(() => {
        setColorSummary(null);
      }, 0);
      return () => clearTimeout(timer);
    }

    let isCurrent = true;
    const fetchSummary = async () => {
      setLoadingColorSummary(true);
      try {
        const summary = await getColorSummary(promptArea.id);
        if (isCurrent) {
          setColorSummary(summary);
        }
      } catch (err) {
        console.error('Failed to fetch color summary:', err);
      } finally {
        if (isCurrent) {
          setLoadingColorSummary(false);
        }
      }
    };

    fetchSummary();

    return () => {
      isCurrent = false;
    };
  }, [promptArea]);

  // Visualization data state
  const [vizData, setVizData] = useState<VisualizationData>({ plotted: [], unplotted: [] });
  const [loadingViz, setLoadingViz] = useState(true);
  const [errorViz, setErrorViz] = useState<string | null>(null);

  // 1. Fetch a new random area to describe
  const loadNewArea = async (showLoading = false, excludeId?: number) => {
    if (showLoading) setLoadingArea(true);
    try {
      const area = await getRandomArea(excludeId);
      setPromptArea(area);
    } catch (err) {
      console.error('Failed to load random area:', err);
    } finally {
      setLoadingArea(false);
    }
  };

  // 2. Fetch visualization coordinates from the API
  const loadVisualizationData = async (showLoading = false) => {
    if (showLoading) setLoadingViz(true);
    try {
      const res = await fetch('/api/visualization');
      if (!res.ok) {
        throw new Error('可視化データの取得に失敗しました。');
      }
      const data: VisualizationData = await res.json();
      setVizData(data);
      setErrorViz(null);
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : '接続エラーが発生しました。';
      setErrorViz(message);
    } finally {
      setLoadingViz(false);
    }
  };

  // On mount: Load initial area and trigger first viz fetch, then start polling
  useEffect(() => {
    // Defer initial fetches to prevent synchronous setState in render path
    const timer = setTimeout(() => {
      loadNewArea(false);
      loadVisualizationData(false);
    }, 0);

    // Poll for updates every 8 seconds
    const interval = setInterval(() => {
      loadVisualizationData(false);
    }, 8000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  // Handle shuffling to a different area
  const handleShuffle = () => {
    setDescription('');
    setMessage(null);
    setSelectedColorId(null);
    setColorMessage(null);
    loadNewArea(true, promptArea?.id);
  };

  // Handle Color Vote Submission
  const handleColorVoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptArea || !selectedColorId || submittingColor) return;

    setSubmittingColor(true);
    setColorMessage(null);

    try {
      const result = await submitColorVote(promptArea.id, selectedColorId);
      if (result.success) {
        setColorMessage({
          type: 'success',
          text: 'カラー投票が完了しました！',
        });
        setSelectedColorId(null);
        
        // Refresh summary immediately
        const summary = await getColorSummary(promptArea.id);
        setColorSummary(summary);
      } else {
        setColorMessage({
          type: 'error',
          text: result.error || '投票に失敗しました。',
        });
      }
    } catch (err) {
      console.error('Color vote submission error:', err);
      setColorMessage({
        type: 'error',
        text: 'システムエラーが発生しました。時間をおいて再試行してください。',
      });
    } finally {
      setSubmittingColor(false);
    }
  };


  // 3. Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptArea || submitting) return;

    const charCount = description.trim().length;
    if (charCount < 1 || charCount > 150) {
      setMessage({
        type: 'error',
        text: `説明文は1文字以上、150文字以内で入力してください。（現在 ${charCount} 文字）`,
      });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const result = await submitResponse(promptArea.id, description);
      if (result.success) {
        setMessage({
          type: 'success',
          text: '回答が送信され、データベースに保存されました！マップが間もなく更新されます。',
        });
        setDescription('');
        
        // Instant refresh of visualization data so the user sees results immediately
        loadVisualizationData(false);
        // Load the next area, avoiding the one we just described
        loadNewArea(false, promptArea.id);
      } else {
        setMessage({
          type: 'error',
          text: result.error || '送信に失敗しました。',
        });
      }
    } catch (err) {
      console.error('Submission system error:', err);
      setMessage({
        type: 'error',
        text: 'システムエラーが発生しました。時間をおいて再試行してください。',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const charCount = description.trim().length;
  const isNearLimit = charCount >= 130;

  // Compute stats dynamically on the client using the summary from API (fallback to client-side reduce if summary is absent)
  const totalResponses = vizData.summary
    ? vizData.summary.totalResponses
    : vizData.plotted.reduce((sum, p) => sum + p.responseCount, 0) + vizData.unplotted.reduce((sum, u) => sum + u.responseCount, 0);
  const plottedCount = vizData.summary ? vizData.summary.plottedAreaCount : vizData.plotted.length;

  return (
    <main className={styles.main} data-theme={theme}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Place2Place</h1>
          <button
            onClick={() => setTheme(theme === 'light' ? 'night' : 'light')}
            className={styles.themeToggleBtn}
            aria-label={`テーマを${theme === 'light' ? 'ダーク' : 'ライト'}に切り替え`}
          >
            {theme === 'light' ? 'Night 🌙' : 'Light ☀️'}
          </button>
        </div>

        <div className={styles.headerContent}>
          <p className={styles.tagline}>あの街、どこに似てる？</p>
          <p className={styles.description}>街の印象を言葉で集め、似ている場所を近くに並べます。</p>
        </div>

        <div className={styles.statusMetaBar}>
          <span className={styles.pulseDot}></span>
          <span className={styles.statusMetaText}>
            投稿: <strong>{totalResponses}</strong>件 | マップに出ている街: <strong>{plottedCount}</strong> | まだ投稿がない街: <strong>{vizData.unplotted.length}</strong> | 8秒ごとに更新
          </span>
        </div>
      </header>

      <div className={styles.container}>
        {/* Left Side: Submission Panel */}
        <section className={styles.panelLeft}>
          <div className={`${styles.card} ${styles.voiceCard}`}>
            <div className={styles.sectionHeaderWrapper}>
              <h2 className={styles.sectionTitleEn}>Voice</h2>
            </div>
            <p className={styles.cardDescription}>
              その街の雰囲気や、ふと思い浮かぶ日常のイメージなどを投稿してください。
            </p>

            {loadingArea ? (
              <div className={styles.placeholder}>街の名前をロード中...</div>
            ) : promptArea ? (
              <>
                <form onSubmit={handleSubmit} className={styles.form}>
                  {/* Prompt badge / selection wrapper */}
                  <div className={styles.promptBadge}>
                    <div className={styles.promptText}>
                      <span className={styles.promptLabel}>Place</span>
                      <strong className={styles.promptName}>{promptArea.name}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={handleShuffle}
                      className={styles.shuffleBtn}
                      disabled={submitting}
                      aria-label="別の街に変更する"
                    >
                      別の街にする
                    </button>
                  </div>

                  <div className={styles.textareaWrapper}>
                    <label htmlFor="description-input" className={styles.inputLabel}>
                      街の印象をひとこと
                    </label>
                    <textarea
                      ref={textareaRef}
                      id="description-input"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="例：平日昼はカフェに人が集まり、夜になると古着屋やライブハウスの周りに若者が集う、雑多でカルチャーを感じる街。"
                      className={styles.textarea}
                      disabled={submitting}
                      rows={4}
                      aria-label={`${promptArea.name}のイメージ`}
                    />
                    <div className={styles.counter}>
                      <span className={isNearLimit ? styles.counterNearLimit : styles.counterNormal}>
                        {charCount}
                      </span>
                      <span className={styles.counterSlash}>/</span>
                      <span className={styles.counterMax}>150</span>
                      <span className={styles.counterUnit}>文字</span>
                    </div>
                  </div>

                  {message && (
                    <div className={message.type === 'success' ? styles.alertSuccess : styles.alertError} role="alert">
                      {message.text}
                    </div>
                  )}

                  <button
                    type="submit"
                    className={styles.submitBtn}
                    disabled={submitting || charCount < 1 || charCount > 150}
                  >
                    {submitting ? (
                      <span className={styles.submitLoadingContainer}>
                        <svg className={styles.spinnerIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="8" opacity="0.25" />
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="24" />
                        </svg>
                        <span>投稿中...</span>
                      </span>
                    ) : (
                      '投稿する'
                    )}
                  </button>
                </form>

                {/* Place Color Section */}
                <div className={styles.colorVoteSection}>
                  <div className={styles.colorVoteHeader}>
                    <h3 className={styles.colorVoteTitle}>Place Color</h3>
                    <p className={styles.colorVoteSubtitle}>このPlaceに色をつけるなら？</p>
                  </div>

                  <div className={styles.colorGridWrap}>
                    <div className={styles.colorGrid}>
                      {(() => {
                        const tones = ['pale', 'soft', 'muted', 'deep'];
                        const families = ['sand', 'terracotta', 'amber', 'sage', 'mint', 'sky', 'navy', 'lavender', 'charcoal'];
                        const orderedColors = [];
                        for (const tone of tones) {
                          for (const family of families) {
                            const color = PLACE_COLORS.find(c => c.tone === tone && c.family === family);
                            if (color) {
                              orderedColors.push(color);
                            }
                          }
                        }
                        return orderedColors.map((color) => (
                          <button
                            key={color.id}
                            type="button"
                            className={`${styles.colorChip} ${selectedColorId === color.id ? styles.colorChipSelected : ''}`}
                            style={{ backgroundColor: color.hex, color: color.textColor }}
                            onClick={() => setSelectedColorId(color.id)}
                            aria-label={`${color.name}を選択`}
                          >
                            <div className={styles.colorChipText}>
                              <div className={styles.colorChipTone}>{color.tone}</div>
                              <div className={styles.colorChipFamily}>{color.family}</div>
                            </div>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>

                  {colorMessage && (
                    <div className={colorMessage.type === 'success' ? styles.alertSuccess : styles.alertError} role="alert" style={{ marginBottom: '1rem' }}>
                      {colorMessage.text}
                    </div>
                  )}

                  <div className={styles.colorVoteSubmitWrapper}>
                    {selectedColorId && (
                      <div className={styles.selectedColorPreview}>
                        選択中: <strong style={{ color: PLACE_COLORS.find(c => c.id === selectedColorId)?.hex }}>
                          {PLACE_COLORS.find(c => c.id === selectedColorId)?.name}
                        </strong>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleColorVoteSubmit}
                      className={styles.colorVoteBtn}
                      disabled={!selectedColorId || submittingColor}
                    >
                      {submittingColor ? '投票中...' : 'この色で投票'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className={styles.placeholderError}>
                エリアをロードできませんでした。シードスクリプトが実行されているか確認してください。
              </div>
            )}
          </div>
        </section>

        {/* Right Side: Mapping Stage */}
        <section className={styles.panelRight}>
          <div className={styles.mapStage}>
            <div className={styles.sectionHeaderWrapper}>
              <h2 className={styles.sectionTitleEn}>Place Finder</h2>
              <span className={styles.sectionSubtitleJa}>似た印象の街ほど、近くに並びます。</span>
            </div>

            {loadingViz ? (
              <div className={styles.vizPlaceholder}>マップデータを生成中...</div>
            ) : errorViz ? (
              <div className={styles.vizPlaceholderError}>{errorViz}</div>
            ) : (
              <div className={styles.vizContainer}>
                {(() => {
                  const validPlotted = vizData.plotted.filter(
                    (p) => typeof p.x === 'number' && !isNaN(p.x) && typeof p.y === 'number' && !isNaN(p.y)
                  );
                  return validPlotted.length >= 2 ? (
                    <ScatterPlot
                      plottedAreas={validPlotted}
                      activeAreaId={promptArea?.id}
                      onAreaSelect={handleAreaSelect}
                    />
                  ) : (
                    <div className={styles.vizPlaceholderEmpty}>
                      <p className={styles.vizPlaceholderEmptyText}>投稿が集まるとここにプロットされます</p>
                      <p className={styles.vizPlaceholderEmptySub}>
                        （プロットの生成には2つ以上の街への投稿が必要です。現在: {validPlotted.length} 箇所）
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Place Color Summary Section */}
            {promptArea && !loadingViz && !errorViz && (
              <div className={styles.colorSummaryContainer}>
                <h3 className={styles.colorSummaryTitle}>
                  Place Color - <span>{promptArea.name}</span>
                </h3>
                {loadingColorSummary ? (
                  <div className={styles.colorSummaryEmpty}>集計データを読み込み中...</div>
                ) : colorSummary ? (
                  <div className={styles.colorSummaryContent}>
                    <div className={styles.colorSummaryLeft}>
                      <div className={styles.repColorBlock}>
                        <div 
                          className={styles.repColorIndicator} 
                          style={{ backgroundColor: colorSummary.representativeColor?.hex || '#cccccc' }}
                        />
                        <div className={styles.repColorInfo}>
                          <div className={styles.repColorLabel}>代表色</div>
                          <div className={styles.repColorName}>{colorSummary.representativeColor?.name || '未設定'}</div>
                          <div className={styles.totalVotesLabel}>総投票数: <strong>{colorSummary.totalVotes}</strong>票</div>
                        </div>
                      </div>
                      <div className={styles.colorAverages}>
                        <div className={styles.averageItem}>
                          <span className={styles.averageLabel}>平均明度 (Lightness)</span>
                          <span className={styles.averageValue}>{colorSummary.averageLightness}</span>
                        </div>
                        <div className={styles.averageItem}>
                          <span className={styles.averageLabel}>平均彩度 (Chroma)</span>
                          <span className={styles.averageValue}>{colorSummary.averageChroma}</span>
                        </div>
                      </div>
                    </div>
                    <div className={styles.colorSummaryRight}>
                      <div className={styles.topColorsTitle}>上位の投票色</div>
                      <div className={styles.topColorsList}>
                        {colorSummary.topColors.map((color) => (
                          <div key={color.id} className={styles.topColorRow}>
                            <div className={styles.topColorNameCell}>
                              <span 
                                className={styles.topColorDot} 
                                style={{ backgroundColor: color.hex }}
                              />
                              <span className={styles.topColorNameText}>{color.name}</span>
                            </div>
                            <div className={styles.topColorBarWrapper}>
                              <div 
                                className={styles.topColorBar} 
                                style={{ 
                                  width: `${color.percentage}%`,
                                  backgroundColor: color.hex
                                }}
                              />
                            </div>
                            <div className={styles.topColorPercent}>{color.percentage}% ({color.count}票)</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.colorSummaryEmpty}>
                    このPlaceに合う色をVoiceカードで選んでみましょう。
                  </div>
                )}
              </div>
            )}

            {/* Unplotted Areas List (Minimalist presentation inside the map stage) */}
            {!loadingViz && !errorViz && (
              <div className={styles.unplottedSection}>
                <h3 className={styles.unplottedTitle}>まだ投稿がない街</h3>
                <p className={styles.unplottedDescription}>投稿が集まると、街の位置が見えてきます。</p>
                {vizData.unplotted.length > 0 ? (
                  <div className={styles.chipsContainer}>
                    {vizData.unplotted.map((item) => (
                      <span
                        key={item.areaId}
                        className={styles.chip}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleAreaSelect(item.areaId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleAreaSelect(item.areaId);
                          }
                        }}
                      >
                        {item.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className={styles.unplottedEmpty}>
                    すべてのエリアに投稿が集まり、プロットが完了しました！
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <p>© 2026 Place2Place. All responses are fully anonymized. No PII is collected.</p>
      </footer>
    </main>
  );
}
