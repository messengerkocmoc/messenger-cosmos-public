package middleware

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

func Maintenance(flagPath string) gin.HandlerFunc {
	return func(ctx *gin.Context) {
		if _, err := os.Stat(flagPath); err == nil {
			ctx.Data(http.StatusServiceUnavailable, "text/html; charset=utf-8", []byte(`
                <!doctype html><html lang="ru"><head><meta charset="utf-8"/><title>Профилактика</title></head>
                <body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;">
                    <div><h1>Сервис на профилактике</h1><p>Повторите попытку позже.</p></div>
                </body></html>`))
			ctx.Abort()
			return
		}
		ctx.Next()
	}
}
