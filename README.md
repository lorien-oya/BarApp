# BarApp
//Hola mundo

## Cómo ver los cambios que ha hecho un compañero en su fork

Hay dos formas principales de ver los cambios que ha realizado un compañero en su fork del repositorio.

---

### Opción 1: Comparar desde GitHub (interfaz web)

GitHub ofrece una herramienta de comparación directamente en el navegador.

1. Ve a la página del repositorio original en GitHub.
2. Haz clic en la pestaña **"Pull requests"** y luego en **"New pull request"**.
3. Haz clic en **"compare across forks"**.
4. En el menú desplegable **"head repository"**, selecciona el fork de tu compañero.
5. Podrás ver todos los cambios que ha realizado respecto a la rama base.

También puedes acceder directamente a la URL de comparación:

```
https://github.com/PROPIETARIO_ORIGINAL/NOMBRE_REPO/compare/main...USUARIO_FORK:NOMBRE_REPO:main
```

Sustituye `PROPIETARIO_ORIGINAL`, `NOMBRE_REPO` y `USUARIO_FORK` por los valores correspondientes.

---

### Opción 2: Usar Git en la línea de comandos

> ⚠️ **Importante:** Debes ejecutar los pasos en orden. Los comandos `git diff` y `git log` del paso 3 y 4 solo funcionarán después de haber completado los pasos 1 y 2.

Por ejemplo, si el nombre de usuario de tu compañero en GitHub es `benediunizar`:

1. Añade el fork de tu compañero como un remoto (usa su nombre de usuario como nombre del remoto):

```bash
git remote add benediunizar https://github.com/benediunizar/BarApp.git
```

2. Descarga los cambios del fork (**obligatorio antes de los siguientes pasos**):

```bash
git fetch benediunizar
```

3. Compara la rama principal del fork con la tuya:

```bash
git diff main benediunizar/main
```

4. Para ver un resumen de los commits añadidos:

```bash
git log main..benediunizar/main --oneline
```

---

Con cualquiera de estas dos opciones podrás ver exactamente qué cambios ha introducido tu compañero en su fork.