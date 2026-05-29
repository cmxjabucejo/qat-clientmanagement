const bcrypt = require("bcryptjs");
const pool = require("../config/dbconfig");

const register = async (req, res) => {
  const { email, firstname, lastname, password } = req.body;

  if (!email || !firstname || !lastname || !password) {
    return res.status(400).json({ message: "All fields are required." });
  }

  const connection = await pool.getConnection();
  try {
    // Check if email already exists
    const [existing] = await connection.query(
      "SELECT * FROM z_webapp_easyapply.registration WHERE email = ?",
      [email],
    );
    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await connection.query(
      `INSERT INTO z_webapp_easyapply.registration 
      (id, provider, email, provider_id, firstname, lastname, middlename, created_datetime) 
      VALUES (UUID(), ?, ?, ?, ?, ?, ?, NOW())`,
      ["manual", email, email, hashedPassword, firstname, lastname, ""],
    );

    return res.status(201).json({ message: "Registration successful." });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ message: "Internal server error." });
  } finally {
    connection.release();
  }
};
