package http

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"mime"
	"net/http"
	"net/smtp"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"github.com/messenger-cosmos-public/internal/auth"
	"github.com/messenger-cosmos-public/internal/config"
	"github.com/messenger-cosmos-public/internal/http/middleware"
)

type Handler struct {
	pool *pgxpool.Pool
	auth *auth.Service
	cfg  config.Config
}

func NewHandler(pool *pgxpool.Pool, authSvc *auth.Service, cfg config.Config) *Handler {
	return &Handler{pool: pool, auth: authSvc, cfg: cfg}
}

func currentUser(ctx *gin.Context) (middleware.UserContext, bool) {
	val, ok := ctx.Get("user")
	if !ok {
		return middleware.UserContext{}, false
	}
	user, ok := val.(middleware.UserContext)
	return user, ok
}

// ---------------------- AUTH ----------------------

func (h *Handler) Register(ctx *gin.Context) {
	var req struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Avatar   string `json:"avatar"`
		DeviceID string `json:"deviceId"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Заполните все обязательные поля"})
		return
	}

	if req.Name == "" || req.Email == "" || req.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Заполните все обязательные поля"})
		return
	}

	if req.DeviceID == "" {
		req.DeviceID = "unknown"
	}

	var accountCount int
	err := h.pool.QueryRow(ctx, `SELECT account_count FROM devices WHERE device_id = $1`, req.DeviceID).Scan(&accountCount)
	if errors.Is(err, pgx.ErrNoRows) {
		if _, insertErr := h.pool.Exec(ctx, `INSERT INTO devices (device_id, account_count) VALUES ($1, 0)`, req.DeviceID); insertErr != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
			return
		}
		accountCount = 0
	} else if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
		return
	}

	if accountCount >= 3 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "На этом устройстве достигнут лимит аккаунтов (3)"})
		return
	}

	var existingID int64
	if err := h.pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, req.Email).Scan(&existingID); err == nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Пользователь с таким email уже существует"})
		return
	} else if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
		return
	}

	avatar := req.Avatar
	if avatar == "" {
		avatar = fmt.Sprintf("https://ui-avatars.com/api/?name=%s&background=random", url.QueryEscape(req.Name))
	}

	var userID int64
	err = h.pool.QueryRow(ctx, `INSERT INTO users (name, email, password, avatar, online) VALUES ($1, $2, $3, $4, true) RETURNING id`, req.Name, req.Email, string(hashed), avatar).Scan(&userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
		return
	}

	if _, err := h.pool.Exec(ctx, `UPDATE devices SET account_count = account_count + 1 WHERE device_id = $1`, req.DeviceID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
		return
	}

	code := generateCode()
	expiresAt := time.Now().Add(h.cfg.VerificationTTL)
	if _, err := h.pool.Exec(ctx, `INSERT INTO email_verifications (user_id, email, code, expires_at) VALUES ($1, $2, $3, $4)`, userID, req.Email, code, expiresAt); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка регистрации"})
		return
	}

	if err := h.sendVerificationEmail(ctx, req.Email, code); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось отправить письмо с кодом подтверждения. Попробуйте позже."})
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"userId":  userID,
		"email":   req.Email,
		"message": "Регистрация успешна. Мы отправили код подтверждения на вашу почту.",
	})
}

func (h *Handler) VerifyEmail(ctx *gin.Context) {
	var req struct {
		UserID   int64  `json:"userId"`
		Code     string `json:"code"`
		DeviceID string `json:"deviceId"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil || req.UserID == 0 || req.Code == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Не переданы пользователь или код"})
		return
	}

	var verification struct {
		ID        int64
		ExpiresAt time.Time
		Used      bool
	}
	row := h.pool.QueryRow(ctx, `SELECT id, expires_at, used FROM email_verifications WHERE user_id = $1 AND code = $2 ORDER BY created_at DESC LIMIT 1`, req.UserID, req.Code)
	if err := row.Scan(&verification.ID, &verification.ExpiresAt, &verification.Used); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Неверный код подтверждения"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка подтверждения email"})
		return
	}

	if verification.Used {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Этот код уже был использован"})
		return
	}
	if time.Now().After(verification.ExpiresAt) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Срок действия кода истёк"})
		return
	}

	if _, err := h.pool.Exec(ctx, `UPDATE email_verifications SET used = true WHERE id = $1`, verification.ID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка подтверждения email"})
		return
	}

	var user struct {
		ID        int64
		Name      string
		Email     string
		Avatar    sql.NullString
		Bio       sql.NullString
		Birthdate sql.NullString
		Online    bool
		IsAdmin   bool
		CreatedAt time.Time
	}
	row = h.pool.QueryRow(ctx, `SELECT id, name, email, avatar, bio, birthdate, online, is_admin, created_at FROM users WHERE id = $1`, req.UserID)
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.Avatar, &user.Bio, &user.Birthdate, &user.Online, &user.IsAdmin, &user.CreatedAt); err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
		return
	}

	token, err := h.auth.Sign(user.ID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка подтверждения email"})
		return
	}

	if _, err := h.pool.Exec(ctx, `INSERT INTO sessions (user_id, token, device_id) VALUES ($1, $2, $3)`, user.ID, token, nullableString(req.DeviceID)); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка подтверждения email"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"user": map[string]any{
			"id":         user.ID,
			"name":       user.Name,
			"email":      user.Email,
			"avatar":     nullToString(user.Avatar),
			"bio":        nullToString(user.Bio),
			"birthdate":  nullToString(user.Birthdate),
			"online":     true,
			"is_admin":   user.IsAdmin,
			"created_at": user.CreatedAt,
		},
		"token":   token,
		"message": "Email успешно подтверждён",
	})
}

func (h *Handler) ResendCode(ctx *gin.Context) {
	var req struct {
		Email string `json:"email"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil || req.Email == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Не передан email"})
		return
	}

	if !h.emailConfigured() {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Сервис отправки писем не настроен. Обратитесь к администратору."})
		return
	}

	var userID int64
	if err := h.pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1`, req.Email).Scan(&userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Пользователь с таким email не найден"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось отправить код ещё раз. Попробуйте позже."})
		return
	}

	code := generateCode()
	expiresAt := time.Now().Add(h.cfg.VerificationTTL)
	if _, err := h.pool.Exec(ctx, `INSERT INTO email_verifications (user_id, email, code, expires_at) VALUES ($1, $2, $3, $4)`, userID, req.Email, code, expiresAt); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось отправить код ещё раз. Попробуйте позже."})
		return
	}

	if err := h.sendVerificationEmail(ctx, req.Email, code); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось отправить код ещё раз. Попробуйте позже."})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Новый код отправлен на вашу почту."})
}

func (h *Handler) Login(ctx *gin.Context) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		DeviceID string `json:"deviceId"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil || req.Email == "" || req.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Заполните email и пароль"})
		return
	}

	var user struct {
		ID        int64
		Name      string
		Email     string
		Password  string
		Avatar    sql.NullString
		Bio       sql.NullString
		Birthdate sql.NullString
		Online    bool
		IsAdmin   bool
		CreatedAt time.Time
	}
	row := h.pool.QueryRow(ctx, `SELECT id, name, email, password, avatar, bio, birthdate, online, is_admin, created_at FROM users WHERE email = $1`, req.Email)
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.Password, &user.Avatar, &user.Bio, &user.Birthdate, &user.Online, &user.IsAdmin, &user.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный email или пароль"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка входа"})
		return
	}

	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Неверный email или пароль"})
		return
	}

	var lastVerificationUsed sql.NullBool
	err := h.pool.QueryRow(ctx, `SELECT used FROM email_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, user.ID).Scan(&lastVerificationUsed)
	if err == nil {
		if !lastVerificationUsed.Valid || !lastVerificationUsed.Bool {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "Пожалуйста, подтвердите email. Мы уже отправили вам код."})
			return
		}
	}

	token, err := h.auth.Sign(user.ID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка входа"})
		return
	}

	if _, err := h.pool.Exec(ctx, `INSERT INTO sessions (user_id, token, device_id) VALUES ($1, $2, $3)`, user.ID, token, nullableString(req.DeviceID)); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка входа"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"user": map[string]any{
			"id":         user.ID,
			"name":       user.Name,
			"email":      user.Email,
			"avatar":     nullToString(user.Avatar),
			"bio":        nullToString(user.Bio),
			"birthdate":  nullToString(user.Birthdate),
			"online":     true,
			"is_admin":   user.IsAdmin,
			"created_at": user.CreatedAt,
		},
		"token":   token,
		"message": "Вход выполнен успешно",
	})
}

func (h *Handler) Logout(ctx *gin.Context) {
	token := tokenFromHeader(ctx.GetHeader("Authorization"))
	if token != "" {
		_, _ = h.pool.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Выход выполнен"})
}

func (h *Handler) VerifyToken(ctx *gin.Context) {
	token := tokenFromHeader(ctx.GetHeader("Authorization"))
	if token == "" {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Токен отсутствует"})
		return
	}

	claims, err := h.auth.Verify(ctx, token)
	if err != nil {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Недействительный токен"})
		return
	}

	var avatar, bio, birthdate sql.NullString
	var online, isAdmin bool
	var createdAt time.Time
	var id int64
	var name, email string
	row := h.pool.QueryRow(ctx, `SELECT id, name, email, avatar, bio, birthdate, online, is_admin, created_at FROM users WHERE id = $1`, claims.UserID)
	if err := row.Scan(&id, &name, &email, &avatar, &bio, &birthdate, &online, &isAdmin, &createdAt); err != nil {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Пользователь не найден"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"user": map[string]any{
		"id":         id,
		"name":       name,
		"email":      email,
		"avatar":     nullToString(avatar),
		"bio":        nullToString(bio),
		"birthdate":  nullToString(birthdate),
		"online":     online,
		"is_admin":   isAdmin,
		"created_at": createdAt,
	}})
}

func (h *Handler) AccountsByDevice(ctx *gin.Context) {
	deviceID := ctx.Param("deviceId")
	rows, err := h.pool.Query(ctx, `SELECT u.id, u.name, u.email, u.avatar FROM users u JOIN sessions s ON u.id = s.user_id WHERE s.device_id = $1 GROUP BY u.id, u.name, u.email, u.avatar`, deviceID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения аккаунтов"})
		return
	}
	defer rows.Close()

	var accounts []map[string]any
	for rows.Next() {
		var id int64
		var name, email string
		var avatar sql.NullString
		if err := rows.Scan(&id, &name, &email, &avatar); err != nil {
			continue
		}
		accounts = append(accounts, map[string]any{
			"id":     id,
			"name":   name,
			"email":  email,
			"avatar": nullToString(avatar),
		})
	}

	ctx.JSON(http.StatusOK, gin.H{"accounts": accounts})
}

// ---------------------- USERS ----------------------

func (h *Handler) ListUsers(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}

	rows, err := h.pool.Query(ctx, `SELECT id, name, email, avatar, bio, birthdate, online, is_admin, banned, created_at FROM users WHERE id != $1 ORDER BY name ASC`, user.ID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения пользователей"})
		return
	}
	defer rows.Close()

	var users []map[string]any
	for rows.Next() {
		var (
			id        int64
			name      string
			email     string
			avatar    sql.NullString
			bio       sql.NullString
			birthdate sql.NullString
			online    bool
			isAdmin   bool
			banned    bool
			createdAt time.Time
		)
		if err := rows.Scan(&id, &name, &email, &avatar, &bio, &birthdate, &online, &isAdmin, &banned, &createdAt); err != nil {
			continue
		}
		users = append(users, map[string]any{
			"id":         id,
			"name":       name,
			"email":      email,
			"avatar":     nullToString(avatar),
			"bio":        nullToString(bio),
			"birthdate":  nullToString(birthdate),
			"online":     online,
			"is_admin":   isAdmin,
			"banned":     banned,
			"created_at": createdAt,
		})
	}

	ctx.JSON(http.StatusOK, gin.H{"users": users})
}

func (h *Handler) GetUser(ctx *gin.Context) {
	id := ctx.Param("id")
	var (
		uid       int64
		name      string
		email     string
		avatar    sql.NullString
		bio       sql.NullString
		birthdate sql.NullString
		online    bool
		isAdmin   bool
		banned    bool
		createdAt time.Time
	)
	row := h.pool.QueryRow(ctx, `SELECT id, name, email, avatar, bio, birthdate, online, is_admin, banned, created_at FROM users WHERE id = $1`, id)
	if err := row.Scan(&uid, &name, &email, &avatar, &bio, &birthdate, &online, &isAdmin, &banned, &createdAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения пользователя"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"user": map[string]any{
		"id":         uid,
		"name":       name,
		"email":      email,
		"avatar":     nullToString(avatar),
		"bio":        nullToString(bio),
		"birthdate":  nullToString(birthdate),
		"online":     online,
		"is_admin":   isAdmin,
		"banned":     banned,
		"created_at": createdAt,
	}})
}

func (h *Handler) UpdateUser(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	targetID := ctx.Param("id")
	var req struct {
		Name      *string `json:"name"`
		Avatar    *string `json:"avatar"`
		Bio       *string `json:"bio"`
		Birthdate *string `json:"birthdate"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Нет данных для обновления"})
		return
	}
	if fmt.Sprint(user.ID) != targetID && !user.IsAdmin {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "Недостаточно прав"})
		return
	}

	updates := []string{}
	params := []any{}
	if req.Name != nil {
		updates = append(updates, "name = $%d")
		params = append(params, *req.Name)
	}
	if req.Avatar != nil {
		updates = append(updates, "avatar = $%d")
		params = append(params, *req.Avatar)
	}
	if req.Bio != nil {
		updates = append(updates, "bio = $%d")
		params = append(params, *req.Bio)
	}
	if req.Birthdate != nil {
		updates = append(updates, "birthdate = $%d")
		params = append(params, *req.Birthdate)
	}
	if len(updates) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Нет данных для обновления"})
		return
	}

	setParts := make([]string, len(updates))
	for i, part := range updates {
		setParts[i] = fmt.Sprintf(part, i+1)
	}
	params = append(params, targetID)
	query := fmt.Sprintf("UPDATE users SET %s WHERE id = $%d", strings.Join(setParts, ", "), len(params))
	if _, err := h.pool.Exec(ctx, query, params...); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обновления профиля"})
		return
	}

	var (
		uid       int64
		name      string
		email     string
		avatar    sql.NullString
		bio       sql.NullString
		birthdate sql.NullString
		online    bool
		isAdmin   bool
		createdAt time.Time
	)
	row := h.pool.QueryRow(ctx, `SELECT id, name, email, avatar, bio, birthdate, online, is_admin, created_at FROM users WHERE id = $1`, targetID)
	if err := row.Scan(&uid, &name, &email, &avatar, &bio, &birthdate, &online, &isAdmin, &createdAt); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обновления профиля"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"user": map[string]any{
		"id":         uid,
		"name":       name,
		"email":      email,
		"avatar":     nullToString(avatar),
		"bio":        nullToString(bio),
		"birthdate":  nullToString(birthdate),
		"online":     online,
		"is_admin":   isAdmin,
		"created_at": createdAt,
	}, "message": "Профиль обновлён"})
}

func (h *Handler) AdminStats(ctx *gin.Context) {
	if !h.requireAdmin(ctx) {
		return
	}
	stats := map[string]int64{}
	for key, query := range map[string]string{
		"users":    "SELECT COUNT(*) FROM users",
		"chats":    "SELECT COUNT(*) FROM chats",
		"messages": "SELECT COUNT(*) FROM messages",
		"devices":  "SELECT COUNT(*) FROM devices",
	} {
		var count int64
		if err := h.pool.QueryRow(ctx, query).Scan(&count); err == nil {
			stats[key] = count
		}
	}
	ctx.JSON(http.StatusOK, gin.H{"stats": stats})
}

func (h *Handler) AdminDevices(ctx *gin.Context) {
	if !h.requireAdmin(ctx) {
		return
	}
	rows, err := h.pool.Query(ctx, `SELECT device_id, account_count, created_at FROM devices ORDER BY created_at DESC`)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения устройств"})
		return
	}
	defer rows.Close()

	var devices []map[string]any
	for rows.Next() {
		var deviceID string
		var accountCount int
		var createdAt time.Time
		if err := rows.Scan(&deviceID, &accountCount, &createdAt); err != nil {
			continue
		}
		devices = append(devices, map[string]any{
			"device_id":     deviceID,
			"account_count": accountCount,
			"created_at":    createdAt,
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"devices": devices})
}

func (h *Handler) ResetDevice(ctx *gin.Context) {
	if !h.requireAdmin(ctx) {
		return
	}
	deviceID := ctx.Param("deviceId")
	if deviceID == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "ID устройства обязателен"})
		return
	}
	tag, err := h.pool.Exec(ctx, `UPDATE devices SET account_count = 0 WHERE device_id = $1`, deviceID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка сброса счётчика"})
		return
	}
	if tag.RowsAffected() == 0 {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Устройство не найдено"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Счётчик устройства сброшен"})
}

func (h *Handler) BanUser(ctx *gin.Context) {
	if !h.requireAdmin(ctx) {
		return
	}
	user, _ := currentUser(ctx)
	targetID := ctx.Param("id")
	if fmt.Sprint(user.ID) == targetID {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя заблокировать себя"})
		return
	}
	var exists bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM users WHERE id = $1`, targetID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка блокировки"})
		return
	}
	if _, err := h.pool.Exec(ctx, `UPDATE users SET banned = true WHERE id = $1`, targetID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка блокировки"})
		return
	}
	_, _ = h.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, targetID)
	ctx.JSON(http.StatusOK, gin.H{"message": "Пользователь заблокирован"})
}

func (h *Handler) UnbanUser(ctx *gin.Context) {
	if !h.requireAdmin(ctx) {
		return
	}
	targetID := ctx.Param("id")
	var exists bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM users WHERE id = $1`, targetID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка разблокировки"})
		return
	}
	if _, err := h.pool.Exec(ctx, `UPDATE users SET banned = false WHERE id = $1`, targetID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка разблокировки"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Пользователь разблокирован"})
}

func (h *Handler) DeleteUser(ctx *gin.Context) {
	if !h.requireAdmin(ctx) {
		return
	}
	user, _ := currentUser(ctx)
	targetID := ctx.Param("id")
	if fmt.Sprint(user.ID) == targetID {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя удалить себя"})
		return
	}
	var exists bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM users WHERE id = $1`, targetID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления пользователя"})
		return
	}
	if _, err := h.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, targetID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления пользователя"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Пользователь удалён"})
}

func (h *Handler) SearchUsers(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	query := ctx.Param("query")
	if len(query) < 2 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Запрос должен содержать мнимум 2 символа"})
		return
	}
	rows, err := h.pool.Query(ctx, `SELECT id, name, email, avatar, bio, online FROM users WHERE (name ILIKE $1 OR email ILIKE $2) AND id != $3 ORDER BY name ASC LIMIT 20`, "%"+query+"%", "%"+query+"%", user.ID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка поиска пользователей"})
		return
	}
	defer rows.Close()

	var users []map[string]any
	for rows.Next() {
		var id int64
		var name, email string
		var avatar, bio sql.NullString
		var online bool
		if err := rows.Scan(&id, &name, &email, &avatar, &bio, &online); err != nil {
			continue
		}
		users = append(users, map[string]any{
			"id":     id,
			"name":   name,
			"email":  email,
			"avatar": nullToString(avatar),
			"bio":    nullToString(bio),
			"online": online,
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"users": users})
}

// ---------------------- CONTACTS ----------------------

func (h *Handler) ListContacts(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	rows, err := h.pool.Query(ctx, `SELECT c.id, u.id, u.name, u.email, u.avatar, u.bio, u.online, u.created_at FROM contacts c JOIN users u ON u.id = c.contact_id WHERE c.owner_id = $1 ORDER BY u.name ASC`, user.ID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения контактов"})
		return
	}
	defer rows.Close()

	var contacts []map[string]any
	for rows.Next() {
		var cid, contactID int64
		var name, email string
		var avatar, bio sql.NullString
		var online bool
		var createdAt time.Time
		if err := rows.Scan(&cid, &contactID, &name, &email, &avatar, &bio, &online, &createdAt); err != nil {
			continue
		}
		contacts = append(contacts, map[string]any{
			"id":         cid,
			"contact_id": contactID,
			"name":       name,
			"email":      email,
			"avatar":     nullToString(avatar),
			"bio":        nullToString(bio),
			"online":     online,
			"created_at": createdAt,
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"contacts": contacts})
}

func (h *Handler) AddContact(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	var req struct {
		UserID    *int64 `json:"userId"`
		ContactID *int64 `json:"contactId"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID контакта"})
		return
	}
	var targetID int64
	if req.UserID != nil {
		targetID = *req.UserID
	} else if req.ContactID != nil {
		targetID = *req.ContactID
	}
	if targetID == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID контакта"})
		return
	}
	if targetID == user.ID {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Нельзя добавить себя в контакты"})
		return
	}

	var exists bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM users WHERE id = $1`, targetID).Scan(&exists); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Пользователь не найден"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка добавления контакта"})
		return
	}

	if _, err := h.pool.Exec(ctx, `INSERT INTO contacts (owner_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, user.ID, targetID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка добавления контакта"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "message": "Контакт добавлен"})
}

func (h *Handler) RemoveContact(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	var req struct {
		UserID    *int64 `json:"userId"`
		ContactID *int64 `json:"contactId"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID контакта"})
		return
	}
	var targetID int64
	if req.UserID != nil {
		targetID = *req.UserID
	} else if req.ContactID != nil {
		targetID = *req.ContactID
	}
	if targetID == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Некорректный ID контакта"})
		return
	}

	if _, err := h.pool.Exec(ctx, `DELETE FROM contacts WHERE owner_id = $1 AND contact_id = $2`, user.ID, targetID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления контакта"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "message": "Контакт удалён"})
}

// ---------------------- CHATS ----------------------

func (h *Handler) ListChats(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	rows, err := h.pool.Query(ctx, `SELECT c.id, c.name, c.avatar, c.type, c.created_at, cp.unread_count, cp.muted, cp.archived, (SELECT text FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message, (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_time FROM chats c JOIN chat_participants cp ON c.id = cp.chat_id WHERE cp.user_id = $1 ORDER BY last_message_time DESC NULLS LAST`, user.ID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения чатов"})
		return
	}
	defer rows.Close()

	var chats []map[string]any
	for rows.Next() {
		var (
			id              int64
			name            sql.NullString
			avatar          sql.NullString
			chatType        string
			createdAt       time.Time
			unreadCount     int
			muted           bool
			archived        bool
			lastMessage     sql.NullString
			lastMessageTime sql.NullTime
		)
		if err := rows.Scan(&id, &name, &avatar, &chatType, &createdAt, &unreadCount, &muted, &archived, &lastMessage, &lastMessageTime); err != nil {
			continue
		}
		chats = append(chats, map[string]any{
			"id":                id,
			"name":              nullToString(name),
			"avatar":            nullToString(avatar),
			"type":              chatType,
			"created_at":        createdAt,
			"unread_count":      unreadCount,
			"muted":             muted,
			"archived":          archived,
			"last_message":      nullToString(lastMessage),
			"last_message_time": nullToTime(lastMessageTime),
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"chats": chats})
}

func (h *Handler) CreateChat(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	var req struct {
		ParticipantIDs []int64 `json:"participantIds"`
		Name           string  `json:"name"`
		Type           string  `json:"type"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil || len(req.ParticipantIDs) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Укажите участников чата"})
		return
	}
	if req.Type == "" {
		req.Type = "personal"
	}

	tx, err := h.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
		return
	}
	defer tx.Rollback(context.Background())

	if req.Type == "personal" && len(req.ParticipantIDs) == 1 {
		otherID := req.ParticipantIDs[0]
		var existingChatID int64
		err := tx.QueryRow(ctx, `SELECT c.id FROM chats c JOIN chat_participants cp1 ON c.id = cp1.chat_id JOIN chat_participants cp2 ON c.id = cp2.chat_id WHERE c.type = 'personal' AND cp1.user_id = $1 AND cp2.user_id = $2`, user.ID, otherID).Scan(&existingChatID)
		if err == nil {
			var name sql.NullString
			var avatar sql.NullString
			var chatType string
			var createdAt time.Time
			if scanErr := tx.QueryRow(ctx, `SELECT id, name, avatar, type, created_at FROM chats WHERE id = $1`, existingChatID).Scan(&existingChatID, &name, &avatar, &chatType, &createdAt); scanErr == nil {
				ctx.JSON(http.StatusOK, gin.H{"chat": map[string]any{"id": existingChatID, "name": nullToString(name), "avatar": nullToString(avatar), "type": chatType, "created_at": createdAt}, "message": "Чат уже существует"})
				tx.Commit(ctx)
				return
			}
		}

		var otherName, otherAvatar sql.NullString
		if err := tx.QueryRow(ctx, `SELECT name, avatar FROM users WHERE id = $1`, otherID).Scan(&otherName, &otherAvatar); err != nil {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "Участник не найден"})
			return
		}
		var chatID int64
		if err := tx.QueryRow(ctx, `INSERT INTO chats (name, avatar, type) VALUES ($1, $2, 'personal') RETURNING id`, nullToString(otherName), nullToString(otherAvatar)).Scan(&chatID); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
			return
		}
		if _, err := tx.Exec(ctx, `INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)`, chatID, user.ID); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
			return
		}
		if _, err := tx.Exec(ctx, `INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)`, chatID, otherID); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
			return
		}
		if err := tx.Commit(ctx); err == nil {
			ctx.JSON(http.StatusCreated, gin.H{"chat": map[string]any{"id": chatID, "name": nullToString(otherName), "avatar": nullToString(otherAvatar), "type": "personal"}, "message": "Чат создан"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
		return
	}

	var chatID int64
	if err := tx.QueryRow(ctx, `INSERT INTO chats (name, avatar, type) VALUES ($1, $2, $3) RETURNING id`, defaultGroupName(req.Name), nil, req.Type).Scan(&chatID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)`, chatID, user.ID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
		return
	}
	for _, pid := range req.ParticipantIDs {
		if _, err := tx.Exec(ctx, `INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)`, chatID, pid); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
			return
		}
	}
	if err := tx.Commit(ctx); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка создания чата"})
		return
	}
	ctx.JSON(http.StatusCreated, gin.H{"chat": map[string]any{"id": chatID, "name": defaultGroupName(req.Name), "avatar": nil, "type": req.Type}, "message": "Групповой чат создан"})
}

func (h *Handler) GetChat(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	chatID := ctx.Param("id")
	var chat struct {
		ID        int64
		Name      sql.NullString
		Avatar    sql.NullString
		Type      string
		CreatedAt time.Time
	}
	row := h.pool.QueryRow(ctx, `SELECT id, name, avatar, type, created_at FROM chats WHERE id = $1`, chatID)
	if err := row.Scan(&chat.ID, &chat.Name, &chat.Avatar, &chat.Type, &chat.CreatedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Чат не найден"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения чата"})
		return
	}
	var participant bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM chat_participants WHERE chat_id = $1 AND user_id = $2`, chat.ID, user.ID).Scan(&participant); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "Вы не участник этого чата"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения чата"})
		return
	}
	rows, err := h.pool.Query(ctx, `SELECT u.id, u.name, u.email, u.avatar, u.online FROM users u JOIN chat_participants cp ON u.id = cp.user_id WHERE cp.chat_id = $1`, chat.ID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения чата"})
		return
	}
	defer rows.Close()
	var participants []map[string]any
	for rows.Next() {
		var pid int64
		var name, email string
		var avatar sql.NullString
		var online bool
		if err := rows.Scan(&pid, &name, &email, &avatar, &online); err != nil {
			continue
		}
		participants = append(participants, map[string]any{
			"id":     pid,
			"name":   name,
			"email":  email,
			"avatar": nullToString(avatar),
			"online": online,
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"chat": map[string]any{
		"id":           chat.ID,
		"name":         nullToString(chat.Name),
		"avatar":       nullToString(chat.Avatar),
		"type":         chat.Type,
		"created_at":   chat.CreatedAt,
		"participants": participants,
	}})
}

func (h *Handler) UpdateChat(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	chatID := ctx.Param("id")
	var req struct {
		Muted       *bool `json:"muted"`
		Archived    *bool `json:"archived"`
		UnreadCount *int  `json:"unreadCount"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Нет данных для обновления"})
		return
	}
	var participant bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM chat_participants WHERE chat_id = $1 AND user_id = $2`, chatID, user.ID).Scan(&participant); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "Вы не участник этого чата"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обновления чата"})
		return
	}
	updates := []string{}
	params := []any{}
	if req.Muted != nil {
		updates = append(updates, "muted = $%d")
		params = append(params, *req.Muted)
	}
	if req.Archived != nil {
		updates = append(updates, "archived = $%d")
		params = append(params, *req.Archived)
	}
	if req.UnreadCount != nil {
		updates = append(updates, "unread_count = $%d")
		params = append(params, *req.UnreadCount)
	}
	if len(updates) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Нет данных для обновления"})
		return
	}
	setParts := make([]string, len(updates))
	for i, part := range updates {
		setParts[i] = fmt.Sprintf(part, i+1)
	}
	params = append(params, chatID, user.ID)
	query := fmt.Sprintf("UPDATE chat_participants SET %s WHERE chat_id = $%d AND user_id = $%d", strings.Join(setParts, ", "), len(params)-1, len(params))
	if _, err := h.pool.Exec(ctx, query, params...); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка обновления чата"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Настройки чата обновлены"})
}

func (h *Handler) DeleteChat(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	chatID := ctx.Param("id")
	var participant bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM chat_participants WHERE chat_id = $1 AND user_id = $2`, chatID, user.ID).Scan(&participant); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "Вы не участник этого чата"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления чата"})
		return
	}
	if _, err := h.pool.Exec(ctx, `DELETE FROM chats WHERE id = $1`, chatID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления чата"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Чат удалён"})
}

// ---------------------- MESSAGES ----------------------

func (h *Handler) ListMessages(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	chatID := ctx.Param("chatId")
	limit := parseInt(ctx.DefaultQuery("limit", "50"), 50)
	offset := parseInt(ctx.DefaultQuery("offset", "0"), 0)

	if !h.ensureParticipant(ctx, chatID, user.ID) {
		return
	}

	rows, err := h.pool.Query(ctx, `SELECT m.id, m.text, m.status, m.created_at, m.sender_id, m.message_type, m.file_url, m.file_name, m.file_size, m.file_type, m.voice_url, m.voice_duration, u.name, u.avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.chat_id = $1 ORDER BY m.created_at ASC LIMIT $2 OFFSET $3`, chatID, limit, offset)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка получения сообщений"})
		return
	}
	defer rows.Close()

	var messages []map[string]any
	for rows.Next() {
		var (
			id            int64
			text          sql.NullString
			status        string
			createdAt     time.Time
			senderID      int64
			messageType   string
			fileURL       sql.NullString
			fileName      sql.NullString
			fileSize      sql.NullInt64
			fileType      sql.NullString
			voiceURL      sql.NullString
			voiceDuration sql.NullInt64
			senderName    string
			senderAvatar  sql.NullString
		)
		if err := rows.Scan(&id, &text, &status, &createdAt, &senderID, &messageType, &fileURL, &fileName, &fileSize, &fileType, &voiceURL, &voiceDuration, &senderName, &senderAvatar); err != nil {
			continue
		}
		messages = append(messages, map[string]any{
			"id":             id,
			"text":           nullToString(text),
			"status":         status,
			"created_at":     createdAt,
			"sender_id":      senderID,
			"message_type":   messageType,
			"file_url":       nullToString(fileURL),
			"file_name":      nullToString(fileName),
			"file_size":      nullToInt64(fileSize),
			"file_type":      nullToString(fileType),
			"voice_url":      nullToString(voiceURL),
			"voice_duration": nullToInt64(voiceDuration),
			"sender_name":    senderName,
			"sender_avatar":  nullToString(senderAvatar),
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"messages": messages})
}

func (h *Handler) SendMessage(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	chatID := ctx.Param("chatId")
	var req struct {
		Text          string  `json:"text"`
		FileURL       *string `json:"file_url"`
		FileName      *string `json:"file_name"`
		FileSize      *int64  `json:"file_size"`
		FileType      *string `json:"file_type"`
		VoiceURL      *string `json:"voice_url"`
		VoiceDuration *int64  `json:"voice_duration"`
		MessageType   string  `json:"message_type"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Сообщение не может быть пустым"})
		return
	}
	if req.Text == "" && req.FileURL == nil && req.VoiceURL == nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Сообщение не может быть пустым"})
		return
	}
	if req.MessageType == "" {
		req.MessageType = "text"
	}

	if !h.ensureParticipant(ctx, chatID, user.ID) {
		return
	}

	var messageID int64
	err := h.pool.QueryRow(ctx, `INSERT INTO messages (chat_id, sender_id, text, message_type, file_url, file_name, file_size, file_type, voice_url, voice_duration, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'sent') RETURNING id`, chatID, user.ID, nullableString(req.Text), req.MessageType, req.FileURL, req.FileName, req.FileSize, req.FileType, req.VoiceURL, req.VoiceDuration).Scan(&messageID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка отправки сообщения"})
		return
	}

	_, _ = h.pool.Exec(ctx, `UPDATE chat_participants SET unread_count = unread_count + 1 WHERE chat_id = $1 AND user_id != $2`, chatID, user.ID)

	var message map[string]any
	var text sql.NullString
	var status string
	var createdAt time.Time
	var senderID int64
	var senderName string
	var senderAvatar sql.NullString
	row := h.pool.QueryRow(ctx, `SELECT m.id, m.text, m.status, m.created_at, m.sender_id, u.name, u.avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = $1`, messageID)
	if err := row.Scan(&messageID, &text, &status, &createdAt, &senderID, &senderName, &senderAvatar); err == nil {
		message = map[string]any{
			"id":            messageID,
			"text":          nullToString(text),
			"status":        status,
			"created_at":    createdAt,
			"sender_id":     senderID,
			"sender_name":   senderName,
			"sender_avatar": nullToString(senderAvatar),
		}
	}
	ctx.JSON(http.StatusCreated, gin.H{"message": message})
}

func (h *Handler) ReactMessage(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	messageID := ctx.Param("messageId")
	var req struct {
		Reaction string `json:"reaction"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil || req.Reaction == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Реакция обязательна"})
		return
	}

	tx, err := h.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Функция реакций временно недоступна"})
		return
	}
	defer tx.Rollback(context.Background())

	if _, err := tx.Exec(ctx, `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2`, messageID, user.ID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Функция реакций временно недоступна"})
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO message_reactions (message_id, user_id, reaction) VALUES ($1, $2, $3)`, messageID, user.ID, req.Reaction); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Функция реакций временно недоступна"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Функция реакций временно недоступна"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "message": "Реакция добавлена"})
}

func (h *Handler) RemoveReaction(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	messageID := ctx.Param("messageId")
	if _, err := h.pool.Exec(ctx, `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2`, messageID, user.ID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Функция реакций временно недоступна"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "message": "Реакция удалена"})
}

func (h *Handler) MarkRead(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	chatID := ctx.Param("chatId")
	if _, err := h.pool.Exec(ctx, `UPDATE chat_participants SET unread_count = 0 WHERE chat_id = $1 AND user_id = $2`, chatID, user.ID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка пометки сообщений"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Сообщения помечены как прочитанные"})
}

func (h *Handler) DeleteMessage(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	messageID := ctx.Param("id")
	var senderID int64
	if err := h.pool.QueryRow(ctx, `SELECT sender_id FROM messages WHERE id = $1`, messageID).Scan(&senderID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusNotFound, gin.H{"error": "Сообщение не найдено"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления сообщения"})
		return
	}
	if senderID != user.ID && !user.IsAdmin {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "Вы не можете удалить это сообщение"})
		return
	}
	if _, err := h.pool.Exec(ctx, `DELETE FROM messages WHERE id = $1`, messageID); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления сообщения"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "Сообщение удалено"})
}

func (h *Handler) SearchMessages(ctx *gin.Context) {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	chatID := ctx.Param("chatId")
	query := ctx.Query("q")
	if len(query) < 2 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Запрос должен содержать минимум 2 символа"})
		return
	}

	if !h.ensureParticipant(ctx, chatID, user.ID) {
		return
	}

	rows, err := h.pool.Query(ctx, `SELECT m.id, m.text, m.created_at, m.sender_id, u.name, u.avatar FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.chat_id = $1 AND m.text ILIKE $2 ORDER BY m.created_at DESC LIMIT 50`, chatID, "%"+query+"%")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка поиска сообщений"})
		return
	}
	defer rows.Close()

	var messages []map[string]any
	for rows.Next() {
		var id int64
		var text sql.NullString
		var createdAt time.Time
		var senderID int64
		var senderName string
		var senderAvatar sql.NullString
		if err := rows.Scan(&id, &text, &createdAt, &senderID, &senderName, &senderAvatar); err != nil {
			continue
		}
		messages = append(messages, map[string]any{
			"id":            id,
			"text":          nullToString(text),
			"created_at":    createdAt,
			"sender_id":     senderID,
			"sender_name":   senderName,
			"sender_avatar": nullToString(senderAvatar),
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"messages": messages})
}

// ---------------------- FILES ----------------------

func (h *Handler) UploadFile(ctx *gin.Context) {
	if _, ok := currentUser(ctx); !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	file, err := ctx.FormFile("file")
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "Файл не загружен"})
		return
	}
	dir := "uploads/files"
	if strings.HasPrefix(file.Header.Get("Content-Type"), "audio/") {
		dir = "uploads/voice"
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка загрузки файла"})
		return
	}
	filename := fmt.Sprintf("%d-%s%s", time.Now().UnixNano(), uuid.NewString(), filepath.Ext(file.Filename))
	path := filepath.Join(dir, filename)
	if err := ctx.SaveUploadedFile(file, path); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка загрузки файла"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"success": true,
		"file": map[string]any{
			"id":           filename,
			"originalName": file.Filename,
			"size":         file.Size,
			"mimetype":     file.Header.Get("Content-Type"),
			"path":         path,
			"url":          fmt.Sprintf("/api/files/%s", filename),
			"uploadedAt":   time.Now().UTC().Format(time.RFC3339),
		},
		"message": "Файл успешно загружен",
	})
}

func (h *Handler) GetFile(ctx *gin.Context) {
	fileID := ctx.Param("fileId")
	voicePath := filepath.Join("uploads", "voice", fileID)
	filesPath := filepath.Join("uploads", "files", fileID)
	var path string
	if _, err := os.Stat(voicePath); err == nil {
		path = voicePath
	} else if _, err := os.Stat(filesPath); err == nil {
		path = filesPath
	}
	if path == "" {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Файл не найден"})
		return
	}
	mimeType := mime.TypeByExtension(filepath.Ext(path))
	if mimeType != "" {
		ctx.Header("Content-Type", mimeType)
	}
	ctx.File(path)
}

func (h *Handler) DeleteFile(ctx *gin.Context) {
	if _, ok := currentUser(ctx); !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return
	}
	fileID := ctx.Param("fileId")
	voicePath := filepath.Join("uploads", "voice", fileID)
	filesPath := filepath.Join("uploads", "files", fileID)
	var path string
	if _, err := os.Stat(voicePath); err == nil {
		path = voicePath
	} else if _, err := os.Stat(filesPath); err == nil {
		path = filesPath
	}
	if path == "" {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Файл не найден"})
		return
	}
	if err := os.Remove(path); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка удаления файла"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"success": true, "message": "Файл удален"})
}

// ---------------------- MAINTENANCE ----------------------

func (h *Handler) ToggleMaintenance(ctx *gin.Context) {
	token := ctx.GetHeader("x-admin-token")
	if token == "" {
		token = ctx.Query("admin_token")
	}
	if token == "" {
		if cookie, err := ctx.Cookie("admin_token"); err == nil {
			token = cookie
		}
	}
	if token == "" || token != h.cfg.AdminToken {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	flag := h.cfg.MaintenanceFlag
	if flag == "" {
		flag = "maintenance.flag"
	}
	if _, err := os.Stat(flag); err == nil {
		if err := os.Remove(flag); err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось снять режим обслуживания"})
			return
		}
		ctx.JSON(http.StatusOK, gin.H{"message": "maintenance_disabled"})
		return
	}
	if err := os.WriteFile(flag, []byte("on"), 0o644); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Не удалось включить режим обслуживания"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "maintenance_enabled"})
}

// ---------------------- HELPERS ----------------------

func (h *Handler) emailConfigured() bool {
	return h.cfg.EmailUser != "" && h.cfg.EmailPass != ""
}

func (h *Handler) sendVerificationEmail(_ context.Context, to, code string) error {
	if !h.emailConfigured() {
		return errors.New("mailer not configured")
	}
	host := "smtp.gmail.com:587"
	authSMTP := smtp.PlainAuth("", h.cfg.EmailUser, h.cfg.EmailPass, "smtp.gmail.com")
	msg := []byte(fmt.Sprintf("To: %s\r\nSubject: kocmoc — код подтверждения\r\n\r\nПривет! 👋\n\nТы регистрируешься в мессенджере kocmoc.\nТвой код подтверждения: %s\n\nКод действует %d минут.\n\nЕсли ты не запрашивал(а) этот код — просто проигнорируй это письмо.\n", to, code, int(h.cfg.VerificationTTL.Minutes())))
	return smtp.SendMail(host, authSMTP, h.cfg.EmailFrom, []string{to}, msg)
}

func generateCode() string {
	n, err := rand.Int(rand.Reader, bigInt(900000))
	if err != nil {
		return "000000"
	}
	return fmt.Sprintf("%06d", 100000+n.Int64())
}

func bigInt(v int64) *big.Int {
	return big.NewInt(v)
}

func tokenFromHeader(header string) string {
	parts := strings.SplitN(header, " ", 2)
	if len(parts) == 2 {
		return parts[1]
	}
	return ""
}

func nullableString[T ~string](v T) *string {
	val := string(v)
	if val == "" {
		return nil
	}
	return &val
}

func nullToString(ns sql.NullString) string {
	if ns.Valid {
		return ns.String
	}
	return ""
}

func nullToInt64(ns sql.NullInt64) int64 {
	if ns.Valid {
		return ns.Int64
	}
	return 0
}

func nullToTime(nt sql.NullTime) *time.Time {
	if nt.Valid {
		return &nt.Time
	}
	return nil
}

func parseInt(value string, fallback int) int {
	if v, err := strconv.Atoi(value); err == nil {
		return v
	}
	return fallback
}

func (h *Handler) requireAdmin(ctx *gin.Context) bool {
	user, ok := currentUser(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "Требуется авторизация"})
		return false
	}
	if !user.IsAdmin {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "Требуются права администратора"})
		return false
	}
	return true
}

func (h *Handler) ensureParticipant(ctx *gin.Context, chatID string, userID int64) bool {
	var participant bool
	if err := h.pool.QueryRow(ctx, `SELECT true FROM chat_participants WHERE chat_id = $1 AND user_id = $2`, chatID, userID).Scan(&participant); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "Вы не участник этого чата"})
			return false
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Ошибка доступа к чату"})
		return false
	}
	return true
}

func defaultGroupName(name string) string {
	if name != "" {
		return name
	}
	return "Групповой чат"
}
