import { App, Modal, Notice, setIcon } from 'obsidian';

interface ContactInfo {
    title: string;
    type: 'qrcode' | 'link' | 'email';
    content: string;
    description: string;
    icon: string;
}

export class HelpModal extends Modal {
    constructor(app: App) {
        super(app);
        this.modalEl.addClass('help-modal');
        this.modalEl.addClass('profile-modal');
    }

    onOpen() {
        this.modalEl.empty();
        this.render();
    }

    private render(): void {
        const container = this.modalEl.createDiv({ cls: 'help-modal-container' });

        // 头部
        this.renderHeader(container);

        // 联系方式区域
        this.renderContactInfo(container);

        // 常见问题
        this.renderFAQ(container);

        // 底部
        this.renderFooter(container);

        console.log('帮助反馈弹窗已渲染');
    }

    private renderHeader(container: HTMLElement): void {
        const header = container.createDiv({ cls: 'modal-header' });

        const titleSection = header.createDiv({ cls: 'header-title-section' });
        const titleIcon = titleSection.createDiv({ cls: 'header-icon' });
        setIcon(titleIcon, 'help-circle');

        const titleText = titleSection.createDiv({ cls: 'header-title' });
        titleText.setText('帮助与反馈');

        const closeBtn = header.createDiv({ cls: 'modal-close-btn' });
        setIcon(closeBtn, 'x');
        closeBtn.onClickEvent(() => this.close());

        const subtitle = container.createDiv({ cls: 'modal-subtitle' });
        subtitle.setText('遇到问题？我们随时为您提供帮助');
    }

    private renderContactInfo(container: HTMLElement): void {
        const contactSection = container.createDiv({ cls: 'contact-section' });

        const sectionTitle = contactSection.createEl('h3', { text: '联系方式' });

        const contactGrid = contactSection.createDiv({ cls: 'contact-grid' });

        const contactInfo: ContactInfo[] = [
            {
                title: 'QQ交流群',
                type: 'qrcode',
                content: 'http://notenote.top/qrcode_1762142781666.jpeg', // 占位二维码
                description: '扫码加入QQ群，与开发者和其他用户交流',
                icon: 'message-square'
            },
            {
                title: '飞书教程',
                type: 'link',
                content: 'https://uqdcpiio07.feishu.cn/wiki/TMdiwuknCiCSafk0DAgc5Ir6nqf?from=from_copylink',
                description: '访问官网获取最新动态和使用教程   密码：linuxdo888',
                icon: 'globe'
            },
            {
                title: '反馈表单',
                type: 'link',
                content: 'https://uqdcpiio07.feishu.cn/share/base/form/shrcnNxR4XnLHCteXPFfdxvKlpb?iframeFrom=docx&ccm_open=iframe',
                description: '提交功能建议和问题反馈',
                icon: 'edit-3'
            },
            {
                title: '邮箱联系',
                type: 'email',
                content: 'songshouli123@126.com',
                description: '通过邮件给我反馈问题',
                icon: 'mail'
            }
        ];

        contactInfo.forEach(info => {
            this.createContactCard(contactGrid, info);
        });
    }

    private createContactCard(container: HTMLElement, info: ContactInfo): void {
        const card = container.createDiv({ cls: 'contact-card' });

        const iconEl = card.createDiv({ cls: 'contact-icon' });
        setIcon(iconEl, info.icon);

        const contentEl = card.createDiv({ cls: 'contact-content' });

        const titleEl = contentEl.createDiv({ cls: 'contact-title' });
        titleEl.setText(info.title);

        const descEl = contentEl.createDiv({ cls: 'contact-description' });
        descEl.setText(info.description);

        if (info.type === 'qrcode') {
            const qrcodeEl = card.createDiv({ cls: 'contact-qrcode' });
            const qrcodeImg = qrcodeEl.createEl('img', { attr: { src: info.content, alt: 'QR Code', loading: 'lazy' } });
            qrcodeImg.onClickEvent((evt) => {
                evt?.stopPropagation();
                evt?.preventDefault();
                this.showQRCode(info.title, info.content);
            });
        } else {
            const actionBtn = card.createDiv({ cls: 'contact-action-btn' });
            setIcon(actionBtn, 'external-link');
            actionBtn.onClickEvent((evt) => {
                evt?.stopPropagation();
                evt?.preventDefault();
                this.handleContactAction(info);
            });
        }

        card.onClickEvent(() => {
            this.handleContactAction(info);
        });
    }

    private renderFAQ(container: HTMLElement): void {
        const faqSection = container.createDiv({ cls: 'faq-section' });

        const sectionTitle = faqSection.createEl('h3', { text: '常见问题' });

        const faqItems = [
            {
                question: '如何开始使用闪卡功能？',
                answer: '选择一篇笔记，右键选择"生成闪卡"，设置卡片数量后AI会自动创建闪卡。然后在闪卡页面开始学习。'
            },
            {
                question: 'Quiz评分准不准确？',
                answer: '客观题（单选、多选、填空）系统自动评分完全准确。主观题（简答）由AI辅助评分，准确性较高但可能存在误差。'
            },
            {
                question: '支持哪些AI模型？',
                answer: '目前支持智谱GLM、OpenAI GPT、DeepSeek、Google Gemini等主流AI模型，可在设置中配置。'
            },
            {
                question: '学习数据会丢失吗？',
                answer: '所有学习数据都保存在本地Obsidian库中，不会丢失。建议定期备份您的Obsidian库。'
            }
        ];

        const faqList = faqSection.createDiv({ cls: 'faq-list' });

        faqItems.forEach((item, index) => {
            this.createFAQItem(faqList, item, index);
        });
    }

    private createFAQItem(container: HTMLElement, item: { question: string; answer: string }, index: number): void {
        const faqItem = container.createDiv({ cls: 'faq-item' });

        const question = faqItem.createDiv({ cls: 'faq-question' });
        const questionNumber = question.createDiv({ cls: 'faq-number' });
        questionNumber.setText(`${index + 1}`);

        const questionText = question.createDiv({ cls: 'faq-question-text' });
        questionText.setText(item.question);

        const toggleBtn = question.createDiv({ cls: 'faq-toggle-btn' });
        toggleBtn.setText('⌄');

        const answer = faqItem.createDiv({ cls: 'faq-answer' });
        answer.setText(item.answer);

        // 点击展开/收起
        question.onClickEvent(() => {
            if (faqItem.hasClass('faq-item-expanded')) {
                faqItem.removeClass('faq-item-expanded');
                toggleBtn.setText('⌄');
            } else {
                faqItem.addClass('faq-item-expanded');
                toggleBtn.setText('⌃');
            }
        });
    }

    private renderFeedbackForm(container: HTMLElement): void {
        const feedbackSection = container.createDiv({ cls: 'feedback-section' });

        const sectionTitle = feedbackSection.createEl('h3', { text: '快速反馈' });

        const form = feedbackSection.createDiv({ cls: 'feedback-form' });

        const typeGroup = form.createDiv({ cls: 'form-group' });
        const typeLabel = typeGroup.createDiv({ cls: 'form-label' });
        typeLabel.setText('反馈类型');

        const typeSelect = typeGroup.createEl('select', { cls: 'form-select' });
        ['功能建议', '问题反馈', '使用咨询', '其他'].forEach(option => {
            typeSelect.createEl('option', { text: option });
        });

        const contentGroup = form.createDiv({ cls: 'form-group' });
        const contentLabel = contentGroup.createDiv({ cls: 'form-label' });
        contentLabel.setText('详细描述');

        const contentTextarea = contentGroup.createEl('textarea', {
            cls: 'form-textarea',
            attr: { placeholder: '请详细描述您的问题或建议...', rows: 4 }
        });

        const submitBtn = form.createDiv({ cls: 'form-submit-btn' });
        submitBtn.setText('提交反馈');
        submitBtn.onClickEvent(() => {
            this.submitFeedback({
                type: typeSelect.value,
                content: contentTextarea.value
            });
        });
    }

    private renderFooter(container: HTMLElement): void {
        const footer = container.createDiv({ cls: 'modal-footer' });

        const thanksText = footer.createDiv({ cls: 'footer-text' });
        thanksText.setText('感谢您使用思序，您的反馈是我们进步的动力！');

        const versionInfo = footer.createDiv({ cls: 'footer-version' });
        versionInfo.setText('版本 1.0.0');
    }

    private handleContactAction(info: ContactInfo): void {
        if (info.type === 'email') {
            window.open(`mailto:${info.content}`);
        } else if (info.type === 'link') {
            window.open(info.content, '_blank');
        } else if (info.type === 'qrcode') {
            this.showQRCode(info.title, info.content);
        }
    }

    private showQRCode(title: string, imageData: string): void {
        const qrModal = new Modal(this.app);
        qrModal.modalEl.addClass('qrcode-modal');

        qrModal.onOpen = () => {
            const container = qrModal.modalEl.createDiv({ cls: 'qrcode-container' });

            const qrTitle = container.createDiv({ cls: 'qrcode-title' });
            qrTitle.setText(title);

            const qrImage = container.createEl('img', {
                cls: 'qrcode-image',
                attr: { src: imageData, alt: 'QR Code' }
            });

            const qrHint = container.createDiv({ cls: 'qrcode-hint' });
            qrHint.setText('使用手机扫码');
        };

        qrModal.open();
    }

    private submitFeedback(feedback: { type: string; content: string }): void {
        if (!feedback.content.trim()) {
            new Notice('请填写反馈内容');
            return;
        }

        // 这里应该调用实际的反馈提交API
        console.log('用户提交反馈', feedback);

        new Notice('反馈已提交，感谢您的宝贵意见！');
        this.close();
    }

    onClose() {
        console.log('帮助反馈弹窗已关闭');
    }
}
