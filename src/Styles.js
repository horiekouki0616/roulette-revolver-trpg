// src/Styles.js
export const globalStyles = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .spinning { animation: spin 0.5s linear infinite; }
  .reloading { animation: spin 2.0s linear infinite; }
  
  @keyframes hit-flash {
    0% { background-color: rgba(139, 69, 19, 0.8); }
    100% { background-color: transparent; }
  }
  .hit-flash {
    animation: hit-flash 0.3s ease-out;
  }

  @keyframes reticle-spin {
      0% { transform: rotate(0deg) scale(1.2); }
      100% { transform: rotate(90deg) scale(1.0); }
    }
    .reticle-active {
      position: absolute;
      top: -100px;
      right: 100px;
      font-size: 100px;
      color: #ff4500;
      text-shadow: 0 0 10px #f00;
      animation: reticle-spin 0.5s ease-out forwards;
      pointer-events: none;
      z-index: 10;
    }
    .target-selectable {
      cursor: crosshair;
      transition: all 0.2s;
    }
    .target-selectable:hover {
      box-shadow: 0 0 15px rgba(255, 69, 0, 0.5);
    }

  .parchment-card {
    background: #d4c19f;
    background-image: 
      url('https://www.transparenttextures.com/patterns/natural-paper.png'),
      radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, transparent 100%);
    border: 3px solid #3d2b1f;
    border-radius: 5px;
    box-shadow: 8px 8px 15px rgba(0,0,0,0.7);
    color: #2d1b0f;
    font-family: 'Book Antiqua', Georgia, serif;
    position: relative;
    padding: 25px;
    text-align: center;
    line-height: 1.5;
  }
  .parchment-card::before, .parchment-card::after {
    content: '';
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    background: inherit;
    z-index: -1;
    border: inherit;
    box-shadow: inherit;
  }
  .parchment-card::before {
    transform: rotate(0.5deg);
    top: 0px;
    left: 0px;
  }
  .parchment-card::after {
    transform: rotate(-0.5deg);
    top: 0px;
    left: 0px;
  }

  .brass-button {
    background: linear-gradient(to bottom, #a08040, #604820);
    border: 2px outset #c0a060;
    border-radius: 3px;
    color: #fff;
    text-shadow: 1px 1px 2px #000;
    box-shadow: 3px 3px 5px rgba(0,0,0,0.5);
    font-family: 'Book Antiqua', Georgia, serif;
    font-weight: bold;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 1px;
    transition: all 0.1s ease;
  }
  .brass-button:hover {
    background: linear-gradient(to bottom, #b09050, #705830);
    box-shadow: 4px 4px 6px rgba(0,0,0,0.6);
  }
  .brass-button:active {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 2px rgba(0,0,0,0.5);
    border: 2px inset #c0a060;
  }
  .brass-button:disabled {
    background: #403020;
    color: #888;
    cursor: not-allowed;
    box-shadow: none;
    border: 2px solid #201810;
  }

  .iron-log-panel {
    background: #2b201a;
    border: 5px ridge #5d4037;
    padding: 15px;
    box-shadow: 0 0 15px rgba(0,0,0,0.9);
  }

  @keyframes target-shot {
      0% { transform: scale(1); }
      20% { transform: scale(1.4) rotate(15deg); filter: brightness(2); }
      40% { transform: scale(1.4) rotate(-15deg); }
      100% { transform: scale(0) rotate(0); opacity: 0; }
    }

    .reticle-shot {
      animation: target-shot 3.0s forwards;
      font-size: 3rem;
      position: absolute;
      top: -60px;
      right: 140px;
      z-index: 10;
    }

    @keyframes fadeOut {
        0% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        25% { opacity: 0.5; }
        100% { opacity: 0; transform: translate(-50%, -60%) scale(1.2); }
      }

      @keyframes damageFloat {
        0% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-20px); }
      }

`;