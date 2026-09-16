# 🚚 TruckBhai

> **Discover, book, and rent a truck in easy steps.**  
> Find the perfect truck for your cargo, storage, and budget needs with TruckBhai's reliable and affordable rental service.

---

## 📖 Overview

**TruckBhai** is a modern truck rental and logistics web platform designed to streamline commercial vehicle hiring across India. Whether you require mini trucks for intra-city deliveries or heavy-duty multi-axle freight carriers for interstate transit, TruckBhai provides an intuitive booking interface, detailed vehicle specifications, and transparent rental options.

The interface is built to deliver a pixel-accurate implementation inspired by professional Figma designs, featuring responsive proportional canvas scaling across various display sizes.

---

## ✨ Key Features

- **Quick Booking Widget**: Convenient booking form to choose vehicle categories, pickup locations, and schedule pickup/return dates.
- **Brand Filtering**: Browse trucks from leading commercial vehicle manufacturers including **Tata**, **Mahindra**, **Eicher**, and **Leaz**.
- **Body Type Selection**: Select by cargo configuration (Open Body, Closed Container, Flatbed, Trailer, etc.).
- **Fleet Showcase**: Comprehensive vehicle models catalogue with specifications, payload capacity, pricing, and availability.
- **Company Profile & Process**: Transparent overview of operational workflow ("How It Works") and team background.
- **Customer Testimonials**: Authentic feedback and ratings from logistics partners and individual customers.
- **Contact & Support**: Quick enquiry form and direct sales line for instant assistance.
- **Proportional Responsive Scaling**: Smart viewport scaling keeping UI fidelity intact across desktops, laptops, tablets, and mobile screens.

---

## 📄 Pages

| Page | File | Description |
|---|---|---|
| **Home** | `index.html` | Hero section, instant vehicle booking form, brand & body type explorer, featured fleet, and mobile app download promotion. |
| **About Us** | `about.html` | Company mission, operational values, timeline, and the 3-step rental procedure. |
| **Vehicle Models** | `vehicle-models.html` | Full fleet catalog with specifications, load capacities, and rental rates. |
| **Testimonials** | `testimonials.html` | Client testimonials, customer reviews, and success stories. |
| **Our Team** | `our-team.html` | Introduction to key leadership, operations managers, and fleet coordinators. |
| **Contact** | `contact.html` | Enquiries form, customer helpline, office details, and support information. |

---

## 🛠️ Tech Stack

- **HTML5**: Semantic document structure, accessibility landmarks (`nav`, `main`, `section`), and form controls.
- **CSS3**: Custom layouts, absolute positioning aligned to Figma coordinates, custom typography, and transitions.
- **Vanilla JavaScript**: Viewport calculation, proportional canvas fitting (`main.js`), and form submission handling.
- **Typography**: Google Fonts (*Montserrat*, *Poppins*, *Lato*, *Inter*, *Cabin*, *Mulish*, *Work Sans*, *DM Sans*).

---

## 📂 Project Structure

```text
TruckBhai/
├── about.html            # About us & how it works
├── contact.html          # Contact & inquiry form
├── index.html            # Landing page with booking engine
├── our-team.html         # Team showcase
├── testimonials.html     # Client reviews & ratings
├── vehicle-models.html   # Fleet catalogue & pricing
├── css/
│   └── styles.css        # Main stylesheet & layout definitions
├── js/
│   └── main.js           # Responsive canvas scaling & form behaviors
├── images/               # Vehicle assets, icons, and UI graphics
├── .gitignore            # Git ignore configuration
└── README.md             # Project documentation
```

---

## 🚀 Getting Started

No heavy build tools or package managers required. You can preview and run the project locally using any web browser or static server.

### 1. Clone the Repository
```bash
git clone https://github.com/krish007code/TruckBhai.git
cd TruckBhai
```

### 2. Run Locally

#### Option A: Using Python built-in HTTP server (Recommended)
```bash
# Python 3
python3 -m http.server 5500
```
Then open your browser and navigate to: `http://localhost:5500`

#### Option B: Using VS Code Live Server
1. Open the project folder in VS Code.
2. Right-click on `index.html` and click **"Open with Live Server"**.

#### Option C: Direct Browser Opening
Simply double-click `index.html` in your file explorer to open it in your preferred web browser.

---

## 📱 Responsive Design Architecture

TruckBhai implements a proportional viewport scaling technique:
- The base layout is mapped directly to a 1440px desktop grid.
- `js/main.js` calculates available screen width on resize/orientation change:
  $$\text{scale} = \min\left(1, \frac{\text{clientWidth}}{1440}\right)$$
- The `.page` element is scaled via CSS `transform: scale(...)`, keeping elements aligned as designed without layout shifts.

---

## 🤝 Contributing

Contributions are welcome! If you'd like to improve the site or add new features:
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📝 License

This project is licensed under the [MIT License](LICENSE) — feel free to use, modify, and build upon it.
