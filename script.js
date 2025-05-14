document.addEventListener('DOMContentLoaded', function() {
    // Анимация кнопки контактов
    const contactBtn = document.getElementById('contactBtn');
    

    if (contactBtn) {
        contactBtn.addEventListener('click', function() {
            window.open('https://t.me/Embroidery_Geometry', '_blank');
        });
    }
    
    // Плавная прокрутка для всех ссылок
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });
    
    // Анимация элементов при скролле
    const animateOnScroll = function() {
        const elements = document.querySelectorAll('.about-section, .gallery-item, .contact-card');
        
        elements.forEach(element => {
            const elementPosition = element.getBoundingClientRect().top;
            const screenPosition = window.innerHeight / 1.2;
            
            if (elementPosition < screenPosition) {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }
        });
    };
    
    // Установка начального состояния для анимации
    const initAnimation = function() {
        const elements = document.querySelectorAll('.about-section, .gallery-item, .contact-card');
        
        elements.forEach(element => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(20px)';
            element.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        });
    };
    
    initAnimation();
    window.addEventListener('scroll', animateOnScroll);
    animateOnScroll(); // Запустить при загрузке для видимых элементов
});