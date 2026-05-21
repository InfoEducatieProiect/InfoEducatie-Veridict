const cp = require('child_process');

try {
    const cale = cp.execSync('python -c "import sys; print(sys.executable)"', { encoding: 'utf8' }).trim();
    console.log("CALEA REALA ESTE:", cale);
} catch (e) {
    try {
        const cale3 = cp.execSync('python3 -c "import sys; print(sys.executable)"', { encoding: 'utf8' }).trim();
        console.log("CALEA REALA ESTE:", cale3);
    } catch (err) {
        console.log("Nu s-a putut detecta prin comenzi standard.");
    }
}