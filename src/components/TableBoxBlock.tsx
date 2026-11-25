import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Minus, Plus, X } from 'lucide-react';
import type { SoundId, SoundVolume } from '../types/neuron';
import { classifyKeyEventForSound, playTypingSound } from '../utils/soundEngine';
import {
  addBoxColumn,
  addBoxRow,
  MAX_BOX_ROWS,
  moveBoxColumn,
  moveBoxRow,
  removeBoxColumn,
  removeBoxRow,
} from '../utils/tableBox';

interface TableBoxBlockProps {
  blockId: string;
  rows: string[][];
  sound: SoundId;
  soundVolume: SoundVolume;
  onChangeRows: (nextRows: string[][], options?: { discrete?: boolean }) => void;
  onDeleteBox: () => void;
}

function SixDotHorizontal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 18 10"
      className={className ?? 'h-2.5 w-4'}
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="3" cy="2.5" r="1.4" />
      <circle cx="9" cy="2.5" r="1.4" />
      <circle cx="15" cy="2.5" r="1.4" />
      <circle cx="3" cy="7.5" r="1.4" />
      <circle cx="9" cy="7.5" r="1.4" />
      <circle cx="15" cy="7.5" r="1.4" />
    </svg>
  );
}

function SixDotVertical({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 18"
      className={className ?? 'h-4 w-2.5'}
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="2.5" cy="3" r="1.4" />
      <circle cx="7.5" cy="3" r="1.4" />
      <circle cx="2.5" cy="9" r="1.4" />
      <circle cx="7.5" cy="9" r="1.4" />
      <circle cx="2.5" cy="15" r="1.4" />
      <circle cx="7.5" cy="15" r="1.4" />
    </svg>
  );
}

interface BoxCellTextareaProps {
  value: string;
  rIdx: number;
  cIdx: number;
  isHeader: boolean;
  onFocusCell: () => void;
  onBlurCell: () => void;
  onChangeValue: (val: string) => void;
  onKeyDownCell: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}

function BoxCellTextarea({
  value,
  rIdx,
  cIdx,
  isHeader,
  onFocusCell,
  onBlurCell,
  onChangeValue,
  onKeyDownCell,
  registerRef,
}: BoxCellTextareaProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(38, el.scrollHeight)}px`;
  }, [value]);

  return (
    <textarea
      ref={(el) => {
        localRef.current = el;
        registerRef(el);
      }}
      rows={1}
      value={value}
      data-testid={`box-cell-${rIdx}-${cIdx}`}
      aria-label={`Row ${rIdx + 1} Column ${cIdx + 1}`}
      spellCheck={false}
      onFocus={onFocusCell}
      onBlur={onBlurCell}
      onChange={(e) => onChangeValue(e.target.value)}
      onKeyDown={onKeyDownCell}
      style={{ caretColor: 'var(--neuron-accent)' }}
      className={`block min-h-[2.375rem] w-full resize-none overflow-hidden bg-transparent px-3 py-2 text-[0.94rem] leading-snug text-[var(--neuron-text)] placeholder:text-[var(--neuron-muted)]/35 focus:outline-none ${
        isHeader ? 'font-medium' : 'font-normal'
      }`}
    />
  );
}

export function TableBoxBlock({
  blockId,
  rows,
  sound,
  soundVolume,
  onChangeRows,
  onDeleteBox,
}: TableBoxBlockProps) {
  const colCount = Math.max(1, rows[0]?.length ?? 2);
  const canAddRow = rows.length < MAX_BOX_ROWS;

  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [focusedCell, setFocusedCell] = useState<{ r: number; c: number } | null>(null);
  const [draggingCol, setDraggingCol] = useState<{ from: number; over: number } | null>(
    null,
  );
  const [draggingRow, setDraggingRow] = useState<{ from: number; over: number } | null>(
    null,
  );

  const colRefs = useRef<Array<HTMLDivElement | null>>([]);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const cellTextareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const latestRowsRef = useRef(rows);
  latestRowsRef.current = rows;

  const focusCell = (r: number, c: number, selectEnd = true) => {
    const target = cellTextareaRefs.current.get(`${r}-${c}`);
    if (!target) return;
    target.focus();
    if (selectEnd) {
      const len = target.value.length;
      target.setSelectionRange(len, len);
    }
  };

  const updateCell = (rIdx: number, cIdx: number, value: string) => {
    const next = rows.map((row, ri) =>
      ri === rIdx ? row.map((cell, ci) => (ci === cIdx ? value : cell)) : row,
    );
    onChangeRows(next, { discrete: false });
  };

  // Drag column via 6-dot top handle
  const startColumnDrag = (e: React.PointerEvent, fromCol: number) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('neuron-dragging');
    setDraggingCol({ from: fromCol, over: fromCol });
    let currentOver = fromCol;

    const handleMove = (moveEvent: PointerEvent) => {
      const cells = colRefs.current;
      let targetCol = currentOver;
      for (let c = 0; c < colCount; c++) {
        const el = cells[c];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right) {
          targetCol = c;
          break;
        }
        if (c === 0 && moveEvent.clientX < rect.left) {
          targetCol = 0;
          break;
        }
        if (c === colCount - 1 && moveEvent.clientX > rect.right) {
          targetCol = colCount - 1;
        }
      }
      if (targetCol !== currentOver) {
        currentOver = targetCol;
        setDraggingCol({ from: fromCol, over: targetCol });
      }
    };

    const handleUp = () => {
      document.body.classList.remove('neuron-dragging');
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      if (currentOver !== fromCol) {
        onChangeRows(moveBoxColumn(latestRowsRef.current, fromCol, currentOver), {
          discrete: true,
        });
      }
      setDraggingCol(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  // Drag row via 6-dot left handle
  const startRowDrag = (e: React.PointerEvent, fromRow: number) => {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.add('neuron-dragging');
    setDraggingRow({ from: fromRow, over: fromRow });
    let currentOver = fromRow;

    const handleMove = (moveEvent: PointerEvent) => {
      const trs = rowRefs.current;
      let targetRow = currentOver;
      for (let r = 0; r < latestRowsRef.current.length; r++) {
        const el = trs[r];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (moveEvent.clientY >= rect.top && moveEvent.clientY <= rect.bottom) {
          targetRow = r;
          break;
        }
        if (r === 0 && moveEvent.clientY < rect.top) {
          targetRow = 0;
          break;
        }
        if (r === latestRowsRef.current.length - 1 && moveEvent.clientY > rect.bottom) {
          targetRow = latestRowsRef.current.length - 1;
        }
      }
      if (targetRow !== currentOver) {
        currentOver = targetRow;
        setDraggingRow({ from: fromRow, over: targetRow });
      }
    };

    const handleUp = () => {
      document.body.classList.remove('neuron-dragging');
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      if (currentOver !== fromRow) {
        onChangeRows(moveBoxRow(latestRowsRef.current, fromRow, currentOver), {
          discrete: true,
        });
      }
      setDraggingRow(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
  };

  useEffect(() => {
    return () => {
      document.body.classList.remove('neuron-dragging');
    };
  }, []);

  const isEmptyBox = rows.every((r) => r.every((c) => c === ''));

  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      data-testid={`table-box-${blockId}`}
      className="group/box relative my-4 w-full"
      onMouseLeave={() => {
        setHoveredCol(null);
        setHoveredRow(null);
      }}
      onPointerLeave={() => {
        setHoveredCol(null);
        setHoveredRow(null);
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Scroll container: max-h enforces vertical scrollbar near 10 rows / tall text, overflow-x supports infinite cols */}
      <div className="max-h-[24rem] overflow-auto pb-1.5 pr-1.5">
        <div className="relative inline-flex min-w-[23rem] flex-col">
          {/* Top bar: column 6-dot handles + column delete button + box delete button anchored to table width */}
          <div className="flex h-6 items-center pl-7 pr-8">
            <div
              className="grid flex-1"
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(9rem, 1fr))`,
              }}
            >
              {Array.from({ length: colCount }, (_, cIdx) => {
                const showHandle =
                  hoveredCol === cIdx ||
                  draggingCol?.from === cIdx ||
                  focusedCell?.c === cIdx;
                const isDragged = draggingCol?.from === cIdx;
                return (
                  <div
                    key={`col-handle-${cIdx}`}
                    ref={(el) => {
                      colRefs.current[cIdx] = el;
                    }}
                    onMouseEnter={() => setHoveredCol(cIdx)}
                    onMouseLeave={() =>
                      setHoveredCol((prev) => (prev === cIdx ? null : prev))
                    }
                    className="flex h-6 items-center justify-center gap-1"
                  >
                    <button
                      type="button"
                      aria-label={`Drag column ${cIdx + 1}`}
                      data-testid={`box-col-handle-${cIdx}`}
                      onPointerDown={(e) => startColumnDrag(e, cIdx)}
                      className={`flex h-5 w-7 cursor-grab active:cursor-grabbing items-center justify-center rounded transition-opacity duration-150 ${
                        showHandle ? 'opacity-85 hover:opacity-100' : 'pointer-events-none opacity-0'
                      }`}
                      style={{
                        color: isDragged ? 'var(--neuron-accent)' : 'var(--neuron-muted)',
                      }}
                    >
                      <SixDotHorizontal />
                    </button>

                    {colCount > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove column ${cIdx + 1}`}
                        data-testid={`box-remove-col-${cIdx}`}
                        onClick={() => onChangeRows(removeBoxColumn(rows, cIdx), { discrete: true })}
                        className={`flex h-4 w-4 cursor-pointer items-center justify-center rounded transition-all duration-150 ${
                          hoveredCol === cIdx
                            ? 'opacity-65 hover:!opacity-100 hover:text-[var(--neuron-accent)]'
                            : 'pointer-events-none opacity-0'
                        }`}
                        style={{ color: 'var(--neuron-muted)' }}
                        title="Remove column"
                      >
                        <Minus className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Delete whole box button aligned directly at top-right of the box */}
            <button
              type="button"
              aria-label="Delete box"
              title="Delete box"
              data-testid={`box-delete-${blockId}`}
              onClick={onDeleteBox}
              className="-mr-7 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md opacity-0 transition-all duration-150 group-hover/box:opacity-70 hover:!opacity-100 hover:text-[var(--neuron-accent)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
              style={{ color: 'var(--neuron-muted)' }}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex items-stretch">
            {/* Left row gutter + rounded bordered grid table */}
            <div className="flex items-stretch">
              {/* Left gutter column */}
              <div className="flex w-7 shrink-0 flex-col justify-around py-0.5 pr-1">
                {rows.map((_, rIdx) => {
                  const showRowHandle =
                    hoveredRow === rIdx ||
                    draggingRow?.from === rIdx ||
                    focusedCell?.r === rIdx;
                  const isRowDragged = draggingRow?.from === rIdx;
                  return (
                    <div
                      key={`row-gutter-${rIdx}`}
                      onMouseEnter={() => setHoveredRow(rIdx)}
                      onMouseLeave={() =>
                        setHoveredRow((prev) => (prev === rIdx ? null : prev))
                      }
                      className="flex flex-1 items-center justify-end gap-0.5"
                    >
                      {rows.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove row ${rIdx + 1}`}
                          data-testid={`box-remove-row-${rIdx}`}
                          onClick={() => onChangeRows(removeBoxRow(rows, rIdx), { discrete: true })}
                          className={`flex h-4 w-3.5 cursor-pointer items-center justify-center rounded transition-all duration-150 ${
                            hoveredRow === rIdx
                              ? 'opacity-65 hover:!opacity-100 hover:text-[var(--neuron-accent)]'
                              : 'pointer-events-none opacity-0'
                          }`}
                          style={{ color: 'var(--neuron-muted)' }}
                          title="Remove row"
                        >
                          <Minus className="h-2.5 w-2.5" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`Drag row ${rIdx + 1}`}
                        data-testid={`box-row-handle-${rIdx}`}
                        onPointerDown={(e) => startRowDrag(e, rIdx)}
                        className={`flex h-6 w-3.5 cursor-grab active:cursor-grabbing items-center justify-center rounded transition-opacity duration-150 ${
                          showRowHandle ? 'opacity-85 hover:opacity-100' : 'pointer-events-none opacity-0'
                        }`}
                        style={{
                          color: isRowDragged ? 'var(--neuron-accent)' : 'var(--neuron-muted)',
                        }}
                      >
                        <SixDotVertical />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Rounded Outer Box Container */}
              <div
                className="overflow-hidden rounded-lg border shadow-xs transition-colors duration-150"
                style={{
                  borderColor: 'var(--neuron-border)',
                  backgroundColor: 'color-mix(in srgb, var(--neuron-surface) 38%, transparent)',
                }}
              >
                <table className="border-separate border-spacing-0 text-sm">
                  <tbody>
                    {rows.map((row, rIdx) => {
                      const isRowDragged = draggingRow?.from === rIdx;
                      const isRowDropTarget =
                        draggingRow !== null &&
                        draggingRow.over === rIdx &&
                        draggingRow.from !== rIdx;
                      const isLastRow = rIdx === rows.length - 1;

                      return (
                        <tr
                          key={`row-${rIdx}`}
                          ref={(el) => {
                            rowRefs.current[rIdx] = el;
                          }}
                          onMouseEnter={() => setHoveredRow(rIdx)}
                          onMouseLeave={() =>
                            setHoveredRow((prev) => (prev === rIdx ? null : prev))
                          }
                        >
                          {row.map((cell, cIdx) => {
                            const isFirstRow = rIdx === 0;
                            const isFirstCol = cIdx === 0;
                            const isLastCol = cIdx === colCount - 1;
                            const isColDragged = draggingCol?.from === cIdx;
                            const isColDropTarget =
                              draggingCol !== null &&
                              draggingCol.over === cIdx &&
                              draggingCol.from !== cIdx;
                            const highlighted = isColDragged || isRowDragged;
                            const dropHighlighted = isColDropTarget || isRowDropTarget;
                            const isCellFocused =
                              focusedCell?.r === rIdx && focusedCell?.c === cIdx;

                            const cornerRadiusClass = [
                              isFirstRow && isFirstCol ? 'rounded-tl-[7px]' : '',
                              isFirstRow && isLastCol ? 'rounded-tr-[7px]' : '',
                              isLastRow && isFirstCol ? 'rounded-bl-[7px]' : '',
                              isLastRow && isLastCol ? 'rounded-br-[7px]' : '',
                            ]
                              .filter(Boolean)
                              .join(' ');

                            return (
                              <td
                                key={`cell-${rIdx}-${cIdx}`}
                                onMouseEnter={() => {
                                  setHoveredCol(cIdx);
                                  setHoveredRow(rIdx);
                                }}
                                className={`min-w-[9rem] p-0 align-top transition-colors duration-100 ${cornerRadiusClass} ${
                                  !isLastCol ? 'border-r' : ''
                                } ${!isLastRow ? 'border-b' : ''}`}
                                style={{
                                  borderColor: 'var(--neuron-border)',
                                  backgroundColor: highlighted
                                    ? 'color-mix(in srgb, var(--neuron-accent) 18%, var(--neuron-surface))'
                                    : dropHighlighted
                                      ? 'color-mix(in srgb, var(--neuron-text) 12%, transparent)'
                                      : isCellFocused
                                        ? 'color-mix(in srgb, var(--neuron-accent) 11%, var(--neuron-surface))'
                                        : isFirstRow
                                          ? 'color-mix(in srgb, var(--neuron-surface) 48%, transparent)'
                                          : 'transparent',
                                }}
                              >
                                <BoxCellTextarea
                                  value={cell}
                                  rIdx={rIdx}
                                  cIdx={cIdx}
                                  isHeader={rIdx === 0}
                                  registerRef={(el) => {
                                    const key = `${rIdx}-${cIdx}`;
                                    if (el) cellTextareaRefs.current.set(key, el);
                                    else cellTextareaRefs.current.delete(key);
                                  }}
                                  onFocusCell={() => setFocusedCell({ r: rIdx, c: cIdx })}
                                  onBlurCell={() =>
                                    setFocusedCell((prev) =>
                                      prev && prev.r === rIdx && prev.c === cIdx
                                        ? null
                                        : prev,
                                    )
                                  }
                                  onChangeValue={(nextVal) => updateCell(rIdx, cIdx, nextVal)}
                                  onKeyDownCell={(e) => {
                                    const soundKind = classifyKeyEventForSound({
                                      key: e.key,
                                      metaKey: e.metaKey,
                                      ctrlKey: e.ctrlKey,
                                      altKey: e.altKey,
                                    });
                                    if (soundKind && sound !== 'off') {
                                      playTypingSound(sound, soundKind, soundVolume, {
                                        isRepeat: e.repeat,
                                      });
                                    }

                                    if (e.key === 'Tab') {
                                      e.preventDefault();
                                      const totalCells = rows.length * colCount;
                                      const currentFlat = rIdx * colCount + cIdx;
                                      const nextFlat = e.shiftKey
                                        ? currentFlat - 1
                                        : currentFlat + 1;
                                      if (nextFlat >= 0 && nextFlat < totalCells) {
                                        const nr = Math.floor(nextFlat / colCount);
                                        const nc = nextFlat % colCount;
                                        focusCell(nr, nc);
                                      }
                                      return;
                                    }

                                    if (
                                      e.key === 'ArrowUp' &&
                                      rIdx > 0 &&
                                      e.currentTarget.selectionStart === 0 &&
                                      e.currentTarget.selectionEnd === 0
                                    ) {
                                      e.preventDefault();
                                      focusCell(rIdx - 1, cIdx);
                                      return;
                                    }

                                    if (
                                      e.key === 'ArrowDown' &&
                                      rIdx < rows.length - 1 &&
                                      e.currentTarget.selectionStart === cell.length &&
                                      e.currentTarget.selectionEnd === cell.length
                                    ) {
                                      e.preventDefault();
                                      focusCell(rIdx + 1, cIdx);
                                      return;
                                    }

                                    if (
                                      e.key === 'Backspace' &&
                                      isEmptyBox &&
                                      rIdx === 0 &&
                                      cIdx === 0 &&
                                      cell === ''
                                    ) {
                                      e.preventDefault();
                                      onDeleteBox();
                                    }
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right edge hover "+" strip: appends a column (infinite columns) */}
            <div className="ml-1.5 flex w-6.5 shrink-0 flex-col">
              <button
                type="button"
                aria-label="Add column"
                title="Add column"
                data-testid="box-add-col"
                onClick={() => onChangeRows(addBoxColumn(rows), { discrete: true })}
                className="neuron-btn-pop flex h-full w-full cursor-pointer items-center justify-center rounded-md border opacity-0 transition-opacity duration-150 group-hover/box:opacity-75 hover:!opacity-100 hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                style={{
                  borderColor: 'var(--neuron-border)',
                  color: 'var(--neuron-muted)',
                  backgroundColor: 'color-mix(in srgb, var(--neuron-surface) 55%, transparent)',
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Bottom edge hover "+" strip: appends a row (max 10 rows) */}
          {canAddRow && (
            <div className="mt-1.5 pl-7 pr-8">
              <button
                type="button"
                aria-label="Add row"
                title="Add row"
                data-testid="box-add-row"
                onClick={() => onChangeRows(addBoxRow(rows), { discrete: true })}
                className="neuron-btn-pop flex h-6 w-full cursor-pointer items-center justify-center rounded-md border opacity-0 transition-opacity duration-150 group-hover/box:opacity-75 hover:!opacity-100 hover:border-[var(--neuron-accent)] hover:text-[var(--neuron-text)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--neuron-accent)]"
                style={{
                  borderColor: 'var(--neuron-border)',
                  color: 'var(--neuron-muted)',
                  backgroundColor: 'color-mix(in srgb, var(--neuron-surface) 55%, transparent)',
                }}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
