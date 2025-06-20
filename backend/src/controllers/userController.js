const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const User = require('../models/User');

// GET /api/users/me
exports.getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener perfil', error: err.message });
  }
};

// PUT /api/users/me
exports.updateUserProfile = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      username,
      birthDate,
      gender,
      theme,
      avatar // string vacío si se quiere eliminar
    } = req.body;

    const avatarFile = req.file;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    let updated = false;
    const previousGender = user.gender;

    // Actualización de campos simples
    if (firstName && firstName !== user.firstName) {
      user.firstName = firstName;
      updated = true;
    }
    if (lastName && lastName !== user.lastName) {
      user.lastName = lastName;
      updated = true;
    }
    if (username && username !== user.username) {
      user.username = username;
      updated = true;
    }
    if (birthDate && new Date(birthDate).toISOString() !== user.birthDate.toISOString()) {
      user.birthDate = new Date(birthDate);
      updated = true;
    }
    if (gender && gender !== user.gender) {
      user.gender = gender;
      updated = true;
    }
    if (theme && theme !== user.theme) {
      user.theme = theme;
      updated = true;
    }

    // Subida de un nuevo avatar
    if (avatarFile) {
      const oldAvatarPath = user.avatarUrl;
      user.avatarUrl = `/uploads/avatars/${avatarFile.filename}`;
      updated = true;

      // Eliminar avatar anterior si era personalizado
      if (oldAvatarPath && oldAvatarPath.startsWith('/uploads/avatars/')) {
        const fullPath = path.join(__dirname, '..', '..', oldAvatarPath.replace(/^\/+/, ''));
        fs.unlink(fullPath, err => {
          if (err) console.warn('No se pudo eliminar el avatar anterior:', err.message);
        });
      }
    }

    // Eliminar avatar actual (volver al predeterminado)
    if (!avatarFile && avatar === '') {
      const oldAvatarPath = user.avatarUrl;
      const newGender = gender || user.gender;
      const defaultAvatar = newGender === 'female'
        ? '/public/avatars/default-avatar-female.png'
        : '/public/avatars/default-avatar-male.png';

      if (oldAvatarPath && oldAvatarPath.startsWith('/uploads/avatars/')) {
        const fullPath = path.join(__dirname, '..', '..', oldAvatarPath.replace(/^\/+/, ''));
        fs.unlink(fullPath, err => {
          if (err) console.warn('No se pudo eliminar el avatar anterior:', err.message);
        });
      }

      user.avatarUrl = defaultAvatar;
      updated = true;
    }

    // Si el avatar actual es uno por defecto del género anterior y ha cambiado el género
    if (!avatarFile && !avatar && gender && previousGender !== gender) {
      const defaultOld = `/public/avatars/default-avatar-${previousGender}.png`;
      const defaultNew = `/public/avatars/default-avatar-${gender}.png`;

      if (user.avatarUrl === defaultOld) {
        user.avatarUrl = defaultNew;
        updated = true;
      }
    }

    if (updated) await user.save();

    const updatedUser = await User.findById(user.id).select('-password');
    res.json(updatedUser);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar perfil', error: err.message });
  }
};

// PUT /api/users/change-password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Los campos son obligatorios' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Contraseña actualizada correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al cambiar contraseña', error: err.message });
  }
};

// DELETE /api/users/me
exports.deleteUserAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    // Obtener usuario para avatar
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

    // Cascada de datos: boards, columns y tasks
    const Board = require('../models/Board');
    const Column = require('../models/Column');
    const Task = require('../models/Task');

    const boards = await Board.find({ user: userId }).select('_id');
    const boardIds = boards.map(b => b._id);
    const columns = await Column.find({ board: { $in: boardIds } }).select('_id');
    const columnIds = columns.map(c => c._id);

    // Eliminar tareas asociadas
    await Task.deleteMany({ column: { $in: columnIds } });
    // Eliminar columnas asociadas
    await Column.deleteMany({ board: { $in: boardIds } });
    // Eliminar pizarras del usuario
    await Board.deleteMany({ user: userId });

    // Eliminar avatar personalizado si existe
    if (user.avatarUrl && user.avatarUrl.includes('/uploads/avatars/')) {
      const fullPath = path.join(__dirname, '..', '..', user.avatarUrl.replace(/^\/+/, ''));
      fs.unlink(fullPath, err => {
        if (err) console.warn('No se pudo eliminar el avatar del usuario:', err.message);
      });
    }

    // Eliminar usuario
    await User.findByIdAndDelete(userId);
    res.json({ message: 'Cuenta y datos relacionados eliminados correctamente' });
  } catch (err) {
    res.status(500).json({ message: 'Error al eliminar cuenta', error: err.message });
  }
};
