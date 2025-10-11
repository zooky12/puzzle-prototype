// ui/hud.js
export function setupHUD({
  onToggleBuildMode, onUndo, onReset,
  onToggleSolver, onRefreshLevels, onLoadLevel,
  onExport, onImport,
  onRunSolver, onStopSolver,
  onPlaySolution, onExportSolution
}) {
  document.getElementById('build-mode-btn').addEventListener('click', onToggleBuildMode);
  document.getElementById('undo-btn').addEventListener('click', onUndo);
  document.getElementById('reset-btn').addEventListener('click', onReset);

  document.getElementById('toggleSolver').addEventListener('click', onToggleSolver);
  document.getElementById('refresh-server').addEventListener('click', onRefreshLevels);
  document.getElementById('load-server').addEventListener('click', onLoadLevel);

  document.getElementById('export-btn').addEventListener('click', onExport);
  document.getElementById('import-btn').addEventListener('click', ()=> document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', (e)=>{
    const f = e.target.files[0];
    if (!f) return;
    onImport(f);
    e.target.value = '';
  });

  // Solver UI
  const statusEl = document.getElementById('solverProgress');
  const solutionsEl = document.getElementById('solutionsList');
  let cancelFlag = { value:false };

  document.getElementById('runSolver').addEventListener('click', async ()=>{
    const maxDepth = Number(document.getElementById('solverMaxDepth').value);
    const maxNodes = Number(document.getElementById('solverMaxNodes').value);
    const maxSolutions = Number(document.getElementById('solverMaxSolutions').value);
    cancelFlag.value = false;
    document.getElementById('runSolver').disabled = true;
    document.getElementById('stopSolver').disabled = false;

    await onRunSolver({
      maxDepth, maxNodes, maxSolutions,
      onProgress: (t)=> statusEl.textContent = t,
      onSolutions: (solutions)=>{
        solutionsEl.innerHTML = '';
        solutions.forEach((s, i)=>{
            const div = document.createElement('div');
            div.className = 'solutionItem';
            const text = document.createElement('div');
            text.className = 'solutionText';
            text.innerHTML = `#${i+1} len:${s.length} moves: <b>${s.moves}</b>`;
            div.appendChild(text);

            // Botó Play
            const playBtn = document.createElement('button');
            playBtn.textContent = 'Play';
            playBtn.addEventListener('click', ()=> onPlaySolution && onPlaySolution(s.moves));
            // Contenidor accions a la dreta
            const actions = document.createElement('div');
            actions.className = 'solutionActions';
            actions.appendChild(playBtn);

            // Botó Export (opcional)
            const exportBtn = document.createElement('button');
            exportBtn.textContent = 'Export';
            exportBtn.addEventListener('click', ()=> onExportSolution && onExportSolution(s.moves));
            actions.appendChild(exportBtn);

            div.appendChild(actions);

            solutionsEl.appendChild(div);
        });
        statusEl.textContent = `Done. found: ${solutions.length}`;
        }
    });

    document.getElementById('runSolver').disabled = false;
    document.getElementById('stopSolver').disabled = true;
  });

  document.getElementById('stopSolver').addEventListener('click', ()=>{
    cancelFlag.value = true;
    statusEl.textContent = 'Cancel requested...';
    onStopSolver();
  });
}
